import sql from 'mssql';

import {
  getDatabase
} from '../../config/database';

import {
  ProjectService
} from '../projects/project.service';

import {
  GithubService
} from '../github/github.service';

import {
  AIService
} from '../ai/ai.service';

import {
  AIAnalysisResult,
  AnalysisResponse,
  StartCommitAnalysisRequest
} from './analysis.types';


export class AnalysisService {

  private readonly projectService =
    new ProjectService();

  private readonly githubService =
    new GithubService();

  private readonly aiService =
    new AIService();


  /*
   * ANALYZE COMMIT
   */
  async analyzeCommit(
    request: StartCommitAnalysisRequest
  ): Promise<AnalysisResponse> {

    const database =
      await getDatabase();


    /*
     * Obtener proyecto.
     */
    const project =
      await this.projectService
        .getById(
          request.projectId
        );


    if (!project) {

      throw new Error(
        'Proyecto no encontrado.'
      );

    }


    /*
     * Por ahora únicamente GitHub.
     *
     * Se normaliza para evitar problemas
     * con GitHub / github / GITHUB.
     */
    if (
      project.provider
        ?.trim()
        .toLowerCase() !==
      'github'
    ) {

      throw new Error(
        'Por ahora el análisis automático está disponible para proyectos GitHub.'
      );

    }


    if (
      !project.repositoryUrl
    ) {

      throw new Error(
        'El proyecto no tiene repositoryUrl configurado.'
      );

    }


    if (
      !request.branch
        ?.trim()
    ) {

      throw new Error(
        'La rama es requerida.'
      );

    }


    if (
      !request.commitSha
        ?.trim()
    ) {

      throw new Error(
        'El SHA del commit es requerido.'
      );

    }


    /*
     * Limpiar valores recibidos.
     */
    const branch =
      request.branch.trim();

    const commitSha =
      request.commitSha.trim();


    /*
     * Crear AnalysisRun.
     */
    const createRunResult =
      await database
        .request()

        .input(
          'ProjectId',
          sql.Int,
          project.id
        )

        .input(
          'BranchName',
          sql.NVarChar(200),
          branch
        )

        .input(
          'CommitSha',
          sql.NVarChar(100),
          commitSha
        )

        .input(
          'ModelName',
          sql.NVarChar(100),
          this.aiService
            .getModelName()
        )

        .query(`
          INSERT INTO AnalysisRuns
          (
            ProjectId,
            AnalysisType,
            Status,
            BranchName,
            CommitSha,
            ModelName,
            StartedAt,
            DateCreated
          )
          OUTPUT INSERTED.Id
          VALUES
          (
            @ProjectId,
            'Commit',
            'Running',
            @BranchName,
            @CommitSha,
            @ModelName,
            SYSDATETIME(),
            SYSDATETIME()
          )
        `);


    if (
      createRunResult
        .recordset
        .length === 0
    ) {

      throw new Error(
        'No fue posible crear el AnalysisRun.'
      );

    }


    const analysisRunId =
      Number(
        createRunResult
          .recordset[0]
          .Id
      );


    try {

      /*
       * Obtener diff real desde GitHub.
       */
      const commit =
        await this.githubService
          .getCommitDetail(
            project.repositoryUrl,
            commitSha
          );


      /*
       * Validar que GitHub haya regresado
       * información del commit.
       */
      if (
        !commit ||
        !commit.sha
      ) {

        throw new Error(
          'GitHub no regresó información válida del commit.'
        );

      }


      /*
       * Guardar archivos analizados.
       */
      for (
        const file of
        commit.files ?? []
      ) {

        await database
          .request()

          .input(
            'AnalysisRunId',
            sql.BigInt,
            analysisRunId
          )

          .input(
            'FilePath',
            sql.NVarChar(1000),
            file.filename
          )

          .input(
            'ChangeType',
            sql.NVarChar(50),
            file.status
          )

          .input(
            'LinesAdded',
            sql.Int,
            file.additions ?? 0
          )

          .input(
            'LinesRemoved',
            sql.Int,
            file.deletions ?? 0
          )

          .query(`
            INSERT INTO AnalysisFiles
            (
              AnalysisRunId,
              FilePath,
              ChangeType,
              LinesAdded,
              LinesRemoved
            )
            VALUES
            (
              @AnalysisRunId,
              @FilePath,
              @ChangeType,
              @LinesAdded,
              @LinesRemoved
            )
          `);

      }


      /*
       * Mandar cambios al proveedor de IA.
       *
       * Actualmente Gemini.
       */
      const aiResult =
        await this.aiService
          .analyzeCode({

            projectName:
              project.name,

            technologies:
              project.technologies ??
              [],

            branch,

            commitSha:
              commit.sha,

            commitMessage:
              commit.message ?? '',

            files:
              (
                commit.files ??
                []
              )
                .map(
                  file => ({

                    filename:
                      file.filename,

                    status:
                      file.status,

                    additions:
                      file.additions ?? 0,

                    deletions:
                      file.deletions ?? 0,

                    changes:
                      file.changes ?? 0,

                    patch:
                      file.patch

                  })
                )

          });


      /*
       * Validar respuesta de IA.
       */
      if (!aiResult) {

        throw new Error(
          'Gemini no regresó un resultado de análisis.'
        );

      }


      /*
       * Proteger CodeHealth.
       */
      aiResult.codeHealth =
        Math.max(
          0,
          Math.min(
            100,
            Number(
              aiResult.codeHealth ??
              0
            )
          )
        );


      /*
       * Evitar null en findings.
       */
      aiResult.findings =
        aiResult.findings ??
        [];


      /*
       * Guardar findings.
       */
      await this.saveFindings(
        analysisRunId,
        aiResult,
        database
      );


      /*
       * Completar AnalysisRun.
       */
      await database
        .request()

        .input(
          'AnalysisRunId',
          sql.BigInt,
          analysisRunId
        )

        .input(
          'CodeHealth',
          sql.Int,
          aiResult.codeHealth
        )

        .input(
          'RiskLevel',
          sql.NVarChar(30),
          aiResult.riskLevel
        )

        .input(
          'Summary',
          sql.NVarChar(sql.MAX),
          aiResult.summary
        )

        .query(`
          UPDATE AnalysisRuns
          SET
            Status = 'Completed',
            CodeHealth = @CodeHealth,
            RiskLevel = @RiskLevel,
            Summary = @Summary,
            ErrorMessage = NULL,
            CompletedAt = SYSDATETIME()
          WHERE Id = @AnalysisRunId
        `);


      /*
       * Regresar resultado.
       */
      return {

        id:
          analysisRunId,

        projectId:
          project.id,

        projectName:
          project.name,

        branch,

        commitSha:
          commit.sha,

        status:
          'Completed',

        modelName:
          this.aiService
            .getModelName(),

        codeHealth:
          aiResult.codeHealth,

        riskLevel:
          aiResult.riskLevel,

        summary:
          aiResult.summary,

        findings:
          aiResult.findings

      };

    }
    catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : 'Error ejecutando análisis.';


      console.error(
        'Analysis error:',
        error
      );


      /*
       * Marcar análisis como Failed.
       */
      try {

        await database
          .request()

          .input(
            'AnalysisRunId',
            sql.BigInt,
            analysisRunId
          )

          .input(
            'ErrorMessage',
            sql.NVarChar(sql.MAX),
            message
          )

          .query(`
            UPDATE AnalysisRuns
            SET
              Status = 'Failed',
              ErrorMessage = @ErrorMessage,
              CompletedAt = SYSDATETIME()
            WHERE Id = @AnalysisRunId
          `);

      }
      catch (
        updateError
      ) {

        console.error(
          'Error updating AnalysisRun as Failed:',
          updateError
        );

      }


      throw error;

    }

  }


  /*
   * SAVE FINDINGS
   */
  private async saveFindings(
    analysisRunId: number,
    result: AIAnalysisResult,
    database: sql.ConnectionPool
  ): Promise<void> {

    const findings =
      result.findings ??
      [];


    for (
      const finding of findings
    ) {

      /*
       * Validaciones mínimas.
       */
      if (
        !finding.title ||
        !finding.description
      ) {

        continue;

      }


      await database
        .request()

        .input(
          'AnalysisRunId',
          sql.BigInt,
          analysisRunId
        )

        .input(
          'Severity',
          sql.NVarChar(30),
          finding.severity
        )

        .input(
          'Category',
          sql.NVarChar(150),
          finding.category ??
          'General'
        )

        .input(
          'Title',
          sql.NVarChar(500),
          finding.title
        )

        .input(
          'Description',
          sql.NVarChar(sql.MAX),
          finding.description
        )

        .input(
          'Suggestion',
          sql.NVarChar(sql.MAX),
          finding.suggestion ??
          ''
        )

        .input(
          'FilePath',
          sql.NVarChar(1000),
          finding.filePath ??
          ''
        )

        .input(
          'LineNumber',
          sql.Int,
          finding.lineNumber &&
          finding.lineNumber > 0
            ? finding.lineNumber
            : null
        )

        .query(`
          INSERT INTO Findings
          (
            AnalysisRunId,
            Severity,
            Category,
            Title,
            Description,
            Suggestion,
            FilePath,
            LineNumber,
            Status,
            DateCreated
          )
          VALUES
          (
            @AnalysisRunId,
            @Severity,
            @Category,
            @Title,
            @Description,
            @Suggestion,
            @FilePath,
            @LineNumber,
            'New',
            SYSDATETIME()
          )
        `);

    }

  }


  /*
   * GET ANALYSIS
   */
  async getById(
    analysisRunId: number
  ) {

    const database =
      await getDatabase();


    const runResult =
      await database
        .request()

        .input(
          'AnalysisRunId',
          sql.BigInt,
          analysisRunId
        )

        .query(`
          SELECT
            AR.Id,
            AR.ProjectId,
            P.Name AS ProjectName,
            AR.AnalysisType,
            AR.Status,
            AR.BranchName,
            AR.CommitSha,
            AR.ModelName,
            AR.CodeHealth,
            AR.RiskLevel,
            AR.Summary,
            AR.ErrorMessage,
            AR.StartedAt,
            AR.CompletedAt,
            AR.DateCreated
          FROM AnalysisRuns AR

          INNER JOIN Projects P
            ON P.Id = AR.ProjectId

          WHERE AR.Id =
            @AnalysisRunId
        `);


    if (
      runResult
        .recordset
        .length === 0
    ) {

      return null;

    }


    const findingResult =
      await database
        .request()

        .input(
          'AnalysisRunId',
          sql.BigInt,
          analysisRunId
        )

        .query(`
          SELECT
            Id,
            Severity,
            Category,
            Title,
            Description,
            Suggestion,
            FilePath,
            LineNumber,
            Status,
            DateCreated
          FROM Findings

          WHERE AnalysisRunId =
            @AnalysisRunId

          ORDER BY
            CASE Severity
              WHEN 'Critical' THEN 1
              WHEN 'High' THEN 2
              WHEN 'Medium' THEN 3
              WHEN 'Low' THEN 4
              ELSE 5
            END,
            Id
        `);


    return {

      ...runResult
        .recordset[0],

      findings:
        findingResult
          .recordset

    };

  }

}