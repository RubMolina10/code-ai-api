import {
  getDatabase
} from '../../config/database';


export class DashboardService {


  /*
   * GET DASHBOARD
   */
  async getDashboard() {

    const database =
      await getDatabase();


    /*
     * GENERAL METRICS
     */
    const metricsResult =
      await database
        .request()
        .query(`
          SELECT

            (
              SELECT
                COUNT(*)

              FROM Projects

              WHERE Active = 1
            ) AS projectCount,


            (
              SELECT
                COUNT(*)

              FROM Findings

              WHERE Status = 'New'
            ) AS pendingFindings,


            (
              SELECT
                COUNT(
                  DISTINCT CommitSha
                )

              FROM AnalysisRuns

              WHERE
                Status = 'Completed'
                AND CommitSha IS NOT NULL
            ) AS analyzedCommits,


            (
              SELECT
                CAST(
                  COALESCE(
                    AVG(
                      CAST(
                        CodeHealth
                        AS DECIMAL(10, 2)
                      )
                    ),
                    0
                  )
                  AS DECIMAL(10, 0)
                )

              FROM AnalysisRuns

              WHERE
                Status = 'Completed'
                AND CodeHealth IS NOT NULL
            ) AS codeHealth
        `);


    const metrics =
      metricsResult
        .recordset[0];


    /*
     * FINDINGS SUMMARY
     */
    const findingsResult =
      await database
        .request()
        .query(`
          SELECT

            SUM(
              CASE
                WHEN Severity = 'Critical'
                AND Status = 'New'
                THEN 1
                ELSE 0
              END
            ) AS critical,


            SUM(
              CASE
                WHEN Severity = 'High'
                AND Status = 'New'
                THEN 1
                ELSE 0
              END
            ) AS high,


            SUM(
              CASE
                WHEN Severity = 'Medium'
                AND Status = 'New'
                THEN 1
                ELSE 0
              END
            ) AS medium,


            SUM(
              CASE
                WHEN Severity = 'Low'
                AND Status = 'New'
                THEN 1
                ELSE 0
              END
            ) AS low,


            SUM(
              CASE
                WHEN Status = 'Resolved'
                THEN 1
                ELSE 0
              END
            ) AS resolved

          FROM Findings
        `);


    const findingsSummary =
      findingsResult
        .recordset[0];


    /*
     * LAST ANALYSIS
     */
    const lastAnalysisResult =
      await database
        .request()
        .query(`
          SELECT TOP 1

            AR.Id
              AS id,

            AR.ProjectId
              AS projectId,

            P.Name
              AS projectName,

            P.Provider
              AS provider,

            P.RepositoryUrl
              AS repositoryUrl,

            P.DefaultBranch
              AS defaultBranch,

            AR.BranchName
              AS branchName,

            AR.CommitSha
              AS commitSha,

            AR.Status
              AS status,

            AR.CodeHealth
              AS codeHealth,

            AR.RiskLevel
              AS riskLevel,

            AR.ModelName
              AS modelName,

            AR.Summary
              AS summary,

            AR.StartedAt
              AS startedAt,

            AR.CompletedAt
              AS completedAt,

            COUNT(
              AF.Id
            )
              AS filesChanged,

            COALESCE(
              SUM(
                AF.LinesAdded
              ),
              0
            )
              AS linesAdded,

            COALESCE(
              SUM(
                AF.LinesRemoved
              ),
              0
            )
              AS linesRemoved,

            (
              SELECT
                STRING_AGG(
                  PT.Technology,
                  '|'
                )

              FROM ProjectTechnologies PT

              WHERE
                PT.ProjectId =
                P.Id
            )
              AS technologies

          FROM AnalysisRuns AR

          INNER JOIN Projects P
            ON P.Id =
               AR.ProjectId

          LEFT JOIN AnalysisFiles AF
            ON AF.AnalysisRunId =
               AR.Id

          WHERE
            AR.Status =
            'Completed'

          GROUP BY

            AR.Id,
            AR.ProjectId,
            P.Name,
            P.Provider,
            P.RepositoryUrl,
            P.DefaultBranch,
            AR.BranchName,
            AR.CommitSha,
            AR.Status,
            AR.CodeHealth,
            AR.RiskLevel,
            AR.ModelName,
            AR.Summary,
            AR.StartedAt,
            AR.CompletedAt,
            P.Id

          ORDER BY

            AR.CompletedAt DESC,
            AR.Id DESC
        `);


    let lastAnalysis =
      null;


    if (
      lastAnalysisResult
        .recordset
        .length > 0
    ) {

      const row =
        lastAnalysisResult
          .recordset[0];


      lastAnalysis = {

        ...row,

        technologies:
          row.technologies
            ? String(
                row.technologies
              )
                .split('|')
                .filter(Boolean)
            : []

      };

    }


    /*
     * RECENT ANALYSES
     */
    const recentResult =
      await database
        .request()
        .query(`
          SELECT TOP 5

            AR.Id
              AS id,

            AR.ProjectId
              AS projectId,

            P.Name
              AS projectName,

            AR.BranchName
              AS branchName,

            AR.CommitSha
              AS commitSha,

            AR.Status
              AS status,

            AR.CodeHealth
              AS codeHealth,

            AR.RiskLevel
              AS riskLevel,

            AR.ModelName
              AS modelName,

            AR.CompletedAt
              AS completedAt,

            (
              SELECT
                COUNT(*)

              FROM Findings F

              WHERE
                F.AnalysisRunId =
                AR.Id
            )
              AS findingCount

          FROM AnalysisRuns AR

          INNER JOIN Projects P
            ON P.Id =
               AR.ProjectId

          WHERE
            AR.Status =
            'Completed'

          ORDER BY

            AR.CompletedAt DESC,
            AR.Id DESC
        `);


    return {

      metrics: {

        codeHealth:
          Number(
            metrics.codeHealth ??
            0
          ),

        projects:
          Number(
            metrics.projectCount ??
            0
          ),

        findings:
          Number(
            metrics.pendingFindings ??
            0
          ),

        commits:
          Number(
            metrics.analyzedCommits ??
            0
          )

      },


      findingsSummary: {

        critical:
          Number(
            findingsSummary
              .critical ??
            0
          ),

        high:
          Number(
            findingsSummary
              .high ??
            0
          ),

        medium:
          Number(
            findingsSummary
              .medium ??
            0
          ),

        low:
          Number(
            findingsSummary
              .low ??
            0
          ),

        resolved:
          Number(
            findingsSummary
              .resolved ??
            0
          )

      },


      lastAnalysis,

      recentAnalyses:
        recentResult.recordset

    };

  }

}