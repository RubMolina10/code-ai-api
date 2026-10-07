import {
  FastifyInstance
} from 'fastify';

import {
  GithubService
} from './github.service';


export async function githubRoutes(
  app: FastifyInstance
) {

  const githubService =
    new GithubService();


  // BRANCHES

  app.get<{
    Querystring: {
      repositoryUrl?: string;
    };
  }>(
    '/api/github/branches',

    async (
      request,
      reply
    ) => {

      const repositoryUrl =
        request.query
          .repositoryUrl
          ?.trim();


      if (!repositoryUrl) {

        return reply
          .code(400)
          .send({
            message:
              'repositoryUrl is required'
          });

      }


      try {

        const branches =
          await githubService
            .getBranches(
              repositoryUrl
            );


        return {

          repositoryUrl,

          branches

        };

      }
      catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : 'Error consultando GitHub.';


        request.log.error(
          error
        );


        return reply
          .code(400)
          .send({
            message
          });

      }

    }
  );


  // COMMITS

  app.get<{
    Querystring: {
      repositoryUrl?: string;
      branch?: string;
    };
  }>(
    '/api/github/commits',

    async (
      request,
      reply
    ) => {

      const repositoryUrl =
        request.query
          .repositoryUrl
          ?.trim();


      const branch =
        request.query
          .branch
          ?.trim();


      if (!repositoryUrl) {

        return reply
          .code(400)
          .send({
            message:
              'repositoryUrl is required'
          });

      }


      if (!branch) {

        return reply
          .code(400)
          .send({
            message:
              'branch is required'
          });

      }


      try {

        const commits =
          await githubService
            .getCommits(
              repositoryUrl,
              branch
            );


        return {

          repositoryUrl,

          branch,

          total:
            commits.length,

          commits

        };

      }
      catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : 'Error consultando commits de GitHub.';


        request.log.error(
          error
        );


        return reply
          .code(400)
          .send({
            message
          });

      }

    }
  );


  // COMMIT DETAIL / DIFF

  app.get<{
    Querystring: {
      repositoryUrl?: string;
      sha?: string;
    };
  }>(
    '/api/github/commit-diff',

    async (
      request,
      reply
    ) => {

      const repositoryUrl =
        request.query
          .repositoryUrl
          ?.trim();


      const sha =
        request.query
          .sha
          ?.trim();


      if (!repositoryUrl) {

        return reply
          .code(400)
          .send({
            message:
              'repositoryUrl is required'
          });

      }


      if (!sha) {

        return reply
          .code(400)
          .send({
            message:
              'sha is required'
          });

      }


      try {

        const commit =
          await githubService
            .getCommitDetail(
              repositoryUrl,
              sha
            );


        return commit;

      }
      catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : 'Error consultando el commit.';


        request.log.error(
          error
        );


        return reply
          .code(400)
          .send({
            message
          });

      }

    }
  );

}