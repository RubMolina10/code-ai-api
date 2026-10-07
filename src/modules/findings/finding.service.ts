import sql from 'mssql';

import {
  getDatabase
} from '../../config/database';


export interface FindingFilters {

  projectId?: number;

  severity?: string;

  status?: string;

}


export class FindingService {


  /*
   * GET FINDINGS
   */
  async getAll(
    filters: FindingFilters = {}
  ) {

    const database =
      await getDatabase();


    const request =
      database.request();


    let where =
      `
        WHERE 1 = 1
      `;


    /*
     * PROJECT
     */
    if (
      filters.projectId
    ) {

      request.input(
        'ProjectId',
        sql.Int,
        filters.projectId
      );


      where +=
        `
          AND AR.ProjectId = @ProjectId
        `;

    }


    /*
     * SEVERITY
     */
    if (
      filters.severity
    ) {

      request.input(
        'Severity',
        sql.NVarChar(30),
        filters.severity
      );


      where +=
        `
          AND F.Severity = @Severity
        `;

    }


    /*
     * STATUS
     */
    if (
      filters.status
    ) {

      request.input(
        'Status',
        sql.NVarChar(30),
        filters.status
      );


      where +=
        `
          AND F.Status = @Status
        `;

    }


    const result =
      await request.query(`
        SELECT

          F.Id AS id,

          F.AnalysisRunId AS analysisRunId,

          F.Severity AS severity,

          F.Category AS category,

          F.Title AS title,

          F.Description AS description,

          F.Suggestion AS suggestion,

          F.FilePath AS filePath,

          F.LineNumber AS lineNumber,

          F.Status AS status,

          F.DateCreated AS dateCreated,

          F.DateResolved AS dateResolved,

          AR.ProjectId AS projectId,

          AR.BranchName AS branchName,

          AR.CommitSha AS commitSha,

          AR.CodeHealth AS codeHealth,

          AR.RiskLevel AS riskLevel,

          AR.ModelName AS modelName,

          P.Name AS projectName

        FROM Findings F

        INNER JOIN AnalysisRuns AR
          ON AR.Id =
             F.AnalysisRunId

        INNER JOIN Projects P
          ON P.Id =
             AR.ProjectId

        ${where}

        ORDER BY

          CASE F.Severity

            WHEN 'Critical'
              THEN 1

            WHEN 'High'
              THEN 2

            WHEN 'Medium'
              THEN 3

            WHEN 'Low'
              THEN 4

            ELSE 5

          END,

          F.DateCreated DESC
      `);


    return result.recordset;

  }


  /*
   * GET FINDING BY ID
   */
  async getById(
    id: number
  ) {

    const database =
      await getDatabase();


    const result =
      await database
        .request()

        .input(
          'FindingId',
          sql.BigInt,
          id
        )

        .query(`
          SELECT

            F.Id AS id,

            F.AnalysisRunId AS analysisRunId,

            F.Severity AS severity,

            F.Category AS category,

            F.Title AS title,

            F.Description AS description,

            F.Suggestion AS suggestion,

            F.FilePath AS filePath,

            F.LineNumber AS lineNumber,

            F.Status AS status,

            F.DateCreated AS dateCreated,

            F.DateResolved AS dateResolved,

            AR.ProjectId AS projectId,

            AR.BranchName AS branchName,

            AR.CommitSha AS commitSha,

            AR.CodeHealth AS codeHealth,

            AR.RiskLevel AS riskLevel,

            AR.ModelName AS modelName,

            P.Name AS projectName

          FROM Findings F

          INNER JOIN AnalysisRuns AR
            ON AR.Id =
               F.AnalysisRunId

          INNER JOIN Projects P
            ON P.Id =
               AR.ProjectId

          WHERE F.Id =
            @FindingId
        `);


    if (
      result
        .recordset
        .length === 0
    ) {

      return null;

    }


    return result
      .recordset[0];

  }


  /*
   * UPDATE STATUS
   */
  async updateStatus(
    id: number,
    status: string
  ): Promise<boolean> {

    const database =
      await getDatabase();


    const normalizedStatus =
      status.trim();


    if (
      normalizedStatus !==
        'New' &&
      normalizedStatus !==
        'Resolved'
    ) {

      throw new Error(
        'El estado debe ser New o Resolved.'
      );

    }


    const result =
      await database
        .request()

        .input(
          'FindingId',
          sql.BigInt,
          id
        )

        .input(
          'Status',
          sql.NVarChar(30),
          normalizedStatus
        )

        .query(`
          UPDATE Findings

          SET

            Status =
              @Status,

            DateResolved =
              CASE

                WHEN @Status =
                  'Resolved'

                THEN
                  SYSDATETIME()

                ELSE
                  NULL

              END

          WHERE Id =
            @FindingId
        `);


    return (
      result.rowsAffected[0] >
      0
    );

  }

}