import sql from 'mssql';

import { getDatabase } from '../../config/database';

export interface ProjectListItem {

  id: number;

  name: string;

  description?: string;

  projectType: string;

  provider: string;

  repositoryUrl?: string;

  localPath?: string;

  defaultBranch?: string;

  active: boolean;

  technologies: string[];

  dateCreated: Date;

}


export class ProjectService {


  async getAll(): Promise<ProjectListItem[]> {

    const database =
      await getDatabase();


    const result =
      await database
        .request()
        .query(`
          SELECT
              P.Id,
              P.Name,
              P.Description,
              P.ProjectType,
              P.Provider,
              P.RepositoryUrl,
              P.LocalPath,
              P.DefaultBranch,
              P.Active,
              P.DateCreated,

              STRING_AGG(
                  PT.Technology,
                  ','
              ) AS Technologies

          FROM Projects P

          LEFT JOIN ProjectTechnologies PT
              ON PT.ProjectId = P.Id

          WHERE
              P.Active = 1

          GROUP BY
              P.Id,
              P.Name,
              P.Description,
              P.ProjectType,
              P.Provider,
              P.RepositoryUrl,
              P.LocalPath,
              P.DefaultBranch,
              P.Active,
              P.DateCreated

          ORDER BY
              P.Name
        `);


    return result.recordset.map(
      item => ({

        id:
          item.Id,

        name:
          item.Name,

        description:
          item.Description,

        projectType:
          item.ProjectType,

        provider:
          item.Provider,

        repositoryUrl:
          item.RepositoryUrl,

        localPath:
          item.LocalPath,

        defaultBranch:
          item.DefaultBranch,

        active:
          item.Active,

        technologies:
          item.Technologies
            ? item.Technologies
                .split(',')
            : [],

        dateCreated:
          item.DateCreated

      })
    );

  }


  async getById(
    id: number
  ): Promise<ProjectListItem | null> {

    const database =
      await getDatabase();


    const projectResult =
      await database
        .request()
        .input(
          'ProjectId',
          sql.Int,
          id
        )
        .query(`
          SELECT
              Id,
              Name,
              Description,
              ProjectType,
              Provider,
              RepositoryUrl,
              LocalPath,
              DefaultBranch,
              Active,
              DateCreated

          FROM Projects

          WHERE Id = @ProjectId
        `);


    if (
      projectResult.recordset.length === 0
    ) {

      return null;

    }


    const technologyResult =
      await database
        .request()
        .input(
          'ProjectId',
          sql.Int,
          id
        )
        .query(`
          SELECT
              Technology

          FROM ProjectTechnologies

          WHERE ProjectId = @ProjectId

          ORDER BY Technology
        `);


    const item =
      projectResult.recordset[0];


    return {

      id:
        item.Id,

      name:
        item.Name,

      description:
        item.Description,

      projectType:
        item.ProjectType,

      provider:
        item.Provider,

      repositoryUrl:
        item.RepositoryUrl,

      localPath:
        item.LocalPath,

      defaultBranch:
        item.DefaultBranch,

      active:
        item.Active,

      technologies:
        technologyResult.recordset.map(
          technology =>
            technology.Technology
        ),

      dateCreated:
        item.DateCreated

    };

  }
  async create(
  data: {
    name: string;
    description?: string;
    projectType: string;
    provider: string;
    repositoryUrl?: string;
    localPath?: string;
    defaultBranch?: string;
    technologies?: string[];
  }
) {

  const database =
    await getDatabase();


  const transaction =
    new sql.Transaction(database);


  try {

    await transaction.begin();


    const projectResult =
      await new sql.Request(transaction)

        .input(
          'Name',
          sql.NVarChar(150),
          data.name
        )

        .input(
          'Description',
          sql.NVarChar(500),
          data.description || null
        )

        .input(
          'ProjectType',
          sql.NVarChar(30),
          data.projectType
        )

        .input(
          'Provider',
          sql.NVarChar(30),
          data.provider
        )

        .input(
          'RepositoryUrl',
          sql.NVarChar(500),
          data.repositoryUrl || null
        )

        .input(
          'LocalPath',
          sql.NVarChar(500),
          data.localPath || null
        )

        .input(
          'DefaultBranch',
          sql.NVarChar(150),
          data.defaultBranch || null
        )

        .query(`
          INSERT INTO Projects
          (
              Name,
              Description,
              ProjectType,
              Provider,
              RepositoryUrl,
              LocalPath,
              DefaultBranch
          )
          OUTPUT INSERTED.Id
          VALUES
          (
              @Name,
              @Description,
              @ProjectType,
              @Provider,
              @RepositoryUrl,
              @LocalPath,
              @DefaultBranch
          )
        `);


    const projectId =
      projectResult.recordset[0].Id;


    if (
      data.technologies &&
      data.technologies.length > 0
    ) {

      for (
        const technology
        of data.technologies
      ) {

        await new sql.Request(transaction)

          .input(
            'ProjectId',
            sql.Int,
            projectId
          )

          .input(
            'Technology',
            sql.NVarChar(100),
            technology
          )

          .query(`
            INSERT INTO ProjectTechnologies
            (
                ProjectId,
                Technology
            )
            VALUES
            (
                @ProjectId,
                @Technology
            )
          `);

      }

    }


    await transaction.commit();


    return this.getById(
      projectId
    );

  }
  catch (error) {

    await transaction.rollback();

    throw error;

  }

}
async delete(
  id: number
): Promise<boolean> {

  const database =
    await getDatabase();


  const result =
    await database
      .request()

      .input(
        'ProjectId',
        sql.Int,
        id
      )

      .query(`
        UPDATE Projects

        SET
            Active = 0,
            DateUpdated = SYSDATETIME()

        WHERE
            Id = @ProjectId
            AND Active = 1
      `);


  return (
    result.rowsAffected[0] > 0
  );

}

}