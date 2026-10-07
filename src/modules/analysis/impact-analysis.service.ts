import path from 'node:path';

import sql from 'mssql';

import {
  getDatabase
} from '../../config/database';

import {
  ProjectService
} from '../projects/project.service';

import {
  GithubCommitFile,
  GithubService,
  GithubTreeFile
} from '../github/github.service';

import {
  AIService
} from '../ai/ai.service';

import {
  AIAnalysisResult,
  StartCommitAnalysisRequest
} from './analysis.types';

import {
  ImpactAnalysisResponse,
  ImpactRelatedFile
} from './impact-analysis.types';


export class ImpactAnalysisService {

  private readonly projectService =
    new ProjectService();

  private readonly githubService =
    new GithubService();

  private readonly aiService =
    new AIService();


  /*
   * Evitar descargar proyectos completos
   * sin control.
   */
  private readonly maxFilesToScan =
    80;


  private readonly maxRelatedFiles =
    12;


  private readonly maxFileSize =
    150000;


  private readonly maxRelatedContent =
    16000;


  /*
   * Extensiones que vale la pena
   * inspeccionar.
   */
  private readonly sourceExtensions =
    new Set([

      '.cs',

      '.ts',

      '.tsx',

      '.js',

      '.jsx',

      '.java',

      '.py',

      '.vue',

      '.sql',

      '.vb',

      '.fs',

      '.go',

      '.rs',

      '.php'

    ]);


  /*
   * ANALYZE IMPACT
   */
  async analyzeImpact(
    request:
      StartCommitAnalysisRequest
  ): Promise<ImpactAnalysisResponse> {

    const database =
      await getDatabase();


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


    if (
      project.provider
        ?.trim()
        .toLowerCase() !==
      'github'
    ) {

      throw new Error(
        'Impact Analysis está disponible por ahora para proyectos GitHub.'
      );

    }


    if (
      !project.repositoryUrl
    ) {

      throw new Error(
        'El proyecto no tiene repositoryUrl configurado.'
      );

    }


    const branch =
      request.branch
        ?.trim();


    const commitSha =
      request.commitSha
        ?.trim();


    if (!branch) {

      throw new Error(
        'La rama es requerida.'
      );

    }


    if (!commitSha) {

      throw new Error(
        'El SHA del commit es requerido.'
      );

    }


    /*
     * Crear AnalysisRun.
     */
    const createRun =
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
            'Impact',
            'Running',
            @BranchName,
            @CommitSha,
            @ModelName,
            SYSDATETIME(),
            SYSDATETIME()
          )
        `);


    const analysisRunId =
      Number(
        createRun
          .recordset[0]
          .Id
      );


    try {

      /*
       * 1.
       * Obtener commit/diff.
       */
      const commit =
        await this.githubService
          .getCommitDetail(
            project.repositoryUrl,
            commitSha
          );


      /*
       * 2.
       * Extraer símbolos y términos
       * interesantes del cambio.
       */
      const symbols =
        this.extractImpactTerms(
          commit.files
        );


      /*
       * 3.
       * Obtener árbol completo.
       */
      const tree =
        await this.githubService
          .getRepositoryTree(
            project.repositoryUrl,
            branch
          );


      /*
       * 4.
       * Buscar consumidores / archivos
       * relacionados.
       */
      const relatedFiles =
        await this.findRelatedFiles(

          project.repositoryUrl,

          tree,

          commit.files,

          symbols

        );


      /*
       * Guardar archivos cambiados.
       */
      for (
        const file of commit.files
      ) {

        await this.saveAnalysisFile(

          database,

          analysisRunId,

          file.filename,

          file.status,

          file.additions,

          file.deletions

        );

      }


      /*
       * Guardar también los archivos
       * usados como contexto.
       */
      for (
        const file of relatedFiles
      ) {

        await this.saveAnalysisFile(

          database,

          analysisRunId,

          file.path,

          'related-context',

          0,

          0

        );

      }


      /*
       * 5.
       * Construir contexto para Gemini.
       *
       * Reutilizamos AIService para no
       * duplicar integración Gemini,
       * retries, fallbacks, etc.
       */
      const aiResult =
        await this.aiService
          .analyzeCode({

            projectName:
              `${project.name} | Impact / Regression Analysis`,

            technologies:
              project.technologies ??
              [],

            branch,

            commitSha:
              commit.sha,

            commitMessage:
              `
IMPACT / REGRESSION ANALYSIS.

Analyze whether the changes from this commit
can break code outside the modified files.

Files with status "related-context" were NOT
modified by the commit. They are consumers or
related source files included only to evaluate
cross-file impact and regression risk.

Focus especially on:
- changed signatures
- changed return values
- changed nullability
- changed conditions
- changed DTOs/models
- changed APIs
- changed behavior
- callers depending on old behavior
- interfaces and implementations
- shared state
- validations
- database contract changes

Original commit message:

${commit.message}
              `.trim(),

            files: [

              /*
               * Archivos realmente
               * modificados.
               */
              ...commit.files.map(
                file => ({

                  filename:
                    file.filename,

                  status:
                    file.status,

                  additions:
                    file.additions,

                  deletions:
                    file.deletions,

                  changes:
                    file.changes,

                  patch:
                    file.patch

                })
              ),


              /*
               * Archivos relacionados.
               */
              ...relatedFiles.map(
                file => ({

                  filename:
                    file.path,

                  status:
                    'related-context',

                  additions:
                    0,

                  deletions:
                    0,

                  changes:
                    0,

                  patch:
`
[RELATED SOURCE FILE - NOT MODIFIED]

Matched symbols:
${file.matchedTerms.join(', ')}

This file is provided only to determine
whether the commit can affect an existing
consumer or dependency.

SOURCE:

${file.content}
`

                })
              )

            ]

          });


      /*
       * Identificar estos findings
       * claramente como impacto.
       */
      aiResult.findings =
        (
          aiResult.findings ??
          []
        )
          .map(
            finding => ({

              ...finding,

              category:
                finding.category
                  ?.startsWith(
                    'Impact/'
                  )
                  ? finding.category
                  : `Impact/${finding.category || 'Regression'}`

            })
          );


      /*
       * Guardar findings.
       */
      await this.saveFindings(

        database,

        analysisRunId,

        aiResult

      );


      const finalSummary =
        `
${aiResult.summary}

Impact scan:
${symbols.length} symbols extracted,
${tree.length} repository entries inspected,
${relatedFiles.length} related source files included.
        `.trim();


      /*
       * Finalizar AnalysisRun.
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
          finalSummary
        )

        .input(
          'ModelName',
          sql.NVarChar(100),
          this.aiService
            .getModelName()
        )

        .query(`
          UPDATE AnalysisRuns
          SET
            Status = 'Completed',
            CodeHealth = @CodeHealth,
            RiskLevel = @RiskLevel,
            Summary = @Summary,
            ModelName = @ModelName,
            ErrorMessage = NULL,
            CompletedAt = SYSDATETIME()
          WHERE Id = @AnalysisRunId
        `);


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
          finalSummary,

        findings:
          aiResult.findings,

        extractedSymbols:
          symbols,

        scannedFiles:
          tree.length,

        relatedFiles:
          relatedFiles.map(
            file => ({

              path:
                file.path,

              matchedTerms:
                file.matchedTerms,

              score:
                file.score

            })
          )

      };

    }
    catch (error) {

      const message =
        error instanceof Error
          ? error.message
          : 'Error ejecutando Impact Analysis.';


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
      catch (updateError) {

        console.error(
          'Error updating impact AnalysisRun:',
          updateError
        );

      }


      throw error;

    }

  }


  /*
   * EXTRAER TÉRMINOS IMPORTANTES
   */
  private extractImpactTerms(
    files: GithubCommitFile[]
  ): string[] {

    const score =
      new Map<string, number>();


    /*
     * Palabras que no sirven para
     * buscar dependencias.
     */
    const ignored =
      new Set([

        'return',
        'string',
        'number',
        'boolean',
        'public',
        'private',
        'protected',
        'static',
        'async',
        'await',
        'class',
        'interface',
        'function',
        'const',
        'this',
        'null',
        'undefined',
        'true',
        'false',
        'void',
        'using',
        'namespace',
        'import',
        'export',
        'from',
        'new',
        'var',
        'let',
        'else',
        'case',
        'break',
        'default'

      ]);


    for (
      const file of files
    ) {

      /*
       * Nombre del archivo también es
       * un término importante.
       */
      const fileName =
        path.basename(
          file.filename,
          path.extname(
            file.filename
          )
        );


      this.addTerm(
        score,
        ignored,
        fileName,
        5
      );


      const patch =
        file.patch ??
        '';


      /*
       * Solamente líneas modificadas.
       */
      const changedLines =
        patch
          .split('\n')

          .filter(
            line =>
              (
                line.startsWith('+') ||
                line.startsWith('-')
              ) &&
              !line.startsWith('+++') &&
              !line.startsWith('---')
          )

          .join('\n');


      const matches =
        changedLines.match(
          /\b[A-Za-z_][A-Za-z0-9_]{3,}\b/g
        ) ??
        [];


      for (
        const term of matches
      ) {

        /*
         * Damos más valor a PascalCase
         * y camelCase porque suelen ser
         * métodos, clases o propiedades.
         */
        const looksLikeSymbol =
          /[A-Z]/.test(
            term
          );


        this.addTerm(

          score,

          ignored,

          term,

          looksLikeSymbol
            ? 3
            : 1

        );

      }

    }


    return [
      ...score.entries()
    ]

      .sort(
        (
          a,
          b
        ) =>
          b[1] -
          a[1]
      )

      .slice(
        0,
        20
      )

      .map(
        entry =>
          entry[0]
      );

  }


  private addTerm(
    score: Map<string, number>,
    ignored: Set<string>,
    term: string,
    amount: number
  ): void {

    const value =
      term.trim();


    if (
      value.length <
      4
    ) {

      return;

    }


    if (
      ignored.has(
        value.toLowerCase()
      )
    ) {

      return;

    }


    score.set(

      value,

      (
        score.get(
          value
        ) ??
        0
      ) +
      amount

    );

  }


  /*
   * BUSCAR ARCHIVOS RELACIONADOS
   */
  private async findRelatedFiles(

    repositoryUrl: string,

    tree: GithubTreeFile[],

    changedFiles:
      GithubCommitFile[],

    terms:
      string[]

  ): Promise<ImpactRelatedFile[]> {

    const changedPaths =
      new Set(
        changedFiles.map(
          file =>
            file.filename
        )
      );


    const changedDirectories =
      changedFiles.map(
        file =>
          path.posix.dirname(
            file.filename
          )
      );


    /*
     * Filtrado inicial sin descargar
     * contenido.
     */
    const candidates =
      tree

        .filter(
          file =>
            !changedPaths.has(
              file.path
            )
        )

        .filter(
          file =>
            this.isSourceFile(
              file
            )
        )

        .map(
          file => ({

            file,

            pathScore:
              this.calculatePathScore(

                file.path,

                terms,

                changedDirectories

              )

          })
        )

        .sort(
          (
            a,
            b
          ) => {

            if (
              b.pathScore !==
              a.pathScore
            ) {

              return (
                b.pathScore -
                a.pathScore
              );

            }


            return (
              a.file.size -
              b.file.size
            );

          }
        )

        .slice(
          0,
          this.maxFilesToScan
        );


    const related:
      ImpactRelatedFile[] = [];


    /*
     * Procesamos en grupos para no lanzar
     * 80 requests al mismo tiempo.
     */
    const batchSize =
      8;


    for (
      let index = 0;
      index < candidates.length;
      index += batchSize
    ) {

      const batch =
        candidates.slice(
          index,
          index +
          batchSize
        );


      const results =
        await Promise.all(

          batch.map(
            async candidate => {

              const content =
                await this.githubService
                  .getBlobContent(

                    repositoryUrl,

                    candidate.file.sha

                  );


              if (!content) {

                return null;

              }


              const matchedTerms =
                terms.filter(
                  term =>
                    this.containsTerm(
                      content,
                      term
                    )
                );


              if (
                matchedTerms.length ===
                0
              ) {

                return null;

              }


              const contentScore =
                matchedTerms.reduce(
                  (
                    total,
                    term
                  ) =>
                    total +
                    this.countOccurrences(
                      content,
                      term
                    ),
                  0
                );


              const score =
                contentScore +
                candidate.pathScore;


              return {

                path:
                  candidate.file.path,

                matchedTerms,

                score,

                content:
                  content.substring(
                    0,
                    this.maxRelatedContent
                  )

              } satisfies ImpactRelatedFile;

            }
          )

        );


      related.push(
        ...results.filter(
          (
            item
          ): item is ImpactRelatedFile =>
            item !== null
        )
      );

    }


    return related

      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      )

      .slice(
        0,
        this.maxRelatedFiles
      );

  }


  /*
   * SOURCE FILE FILTER
   */
  private isSourceFile(
    file: GithubTreeFile
  ): boolean {

    if (
      file.size <= 0 ||
      file.size >
      this.maxFileSize
    ) {

      return false;

    }


    const lowerPath =
      file.path
        .toLowerCase();


    const ignoredFolders = [

      'node_modules/',
      'dist/',
      'build/',
      'bin/',
      'obj/',
      'vendor/',
      '.git/',
      'coverage/'

    ];


    if (
      ignoredFolders.some(
        folder =>
          lowerPath.includes(
            folder
          )
      )
    ) {

      return false;

    }


    const extension =
      path.extname(
        lowerPath
      );


    return this.sourceExtensions
      .has(
        extension
      );

  }


  /*
   * PATH SCORE
   */
  private calculatePathScore(

    filePath: string,

    terms: string[],

    changedDirectories:
      string[]

  ): number {

    let score =
      0;


    const lowerPath =
      filePath.toLowerCase();


    for (
      const directory of
      changedDirectories
    ) {

      if (
        directory !== '.' &&
        lowerPath.startsWith(
          directory.toLowerCase()
        )
      ) {

        score +=
          8;

      }

    }


    for (
      const term of terms
    ) {

      if (
        lowerPath.includes(
          term.toLowerCase()
        )
      ) {

        score +=
          5;

      }

    }


    return score;

  }


  private containsTerm(
    content: string,
    term: string
  ): boolean {

    const expression =
      new RegExp(
        `\\b${this.escapeRegex(term)}\\b`,
        'i'
      );


    return expression.test(
      content
    );

  }


  private countOccurrences(
    content: string,
    term: string
  ): number {

    const expression =
      new RegExp(
        `\\b${this.escapeRegex(term)}\\b`,
        'gi'
      );


    return (
      content.match(
        expression
      )
      ?.length ??
      0
    );

  }


  private escapeRegex(
    value: string
  ): string {

    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    );

  }


  /*
   * SAVE ANALYSIS FILE
   */
  private async saveAnalysisFile(

    database:
      sql.ConnectionPool,

    analysisRunId:
      number,

    filePath:
      string,

    changeType:
      string,

    linesAdded:
      number,

    linesRemoved:
      number

  ): Promise<void> {

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
        filePath
      )

      .input(
        'ChangeType',
        sql.NVarChar(50),
        changeType
      )

      .input(
        'LinesAdded',
        sql.Int,
        linesAdded
      )

      .input(
        'LinesRemoved',
        sql.Int,
        linesRemoved
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
   * SAVE FINDINGS
   */
  private async saveFindings(

    database:
      sql.ConnectionPool,

    analysisRunId:
      number,

    result:
      AIAnalysisResult

  ): Promise<void> {

    for (
      const finding of
      result.findings ??
      []
    ) {

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
          finding.category
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
          finding.suggestion
        )

        .input(
          'FilePath',
          sql.NVarChar(1000),
          finding.filePath
        )

        .input(
          'LineNumber',
          sql.Int,
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

}