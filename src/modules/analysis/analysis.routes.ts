import {
  FastifyInstance
} from 'fastify';

import {
  AnalysisService
} from './analysis.service';

import {
  StartCommitAnalysisRequest
} from './analysis.types';


export async function analysisRoutes(
  app: FastifyInstance
) {

  const analysisService =
    new AnalysisService();


  /*
   * ANALYZE COMMIT
   */
  app.post<{
    Body: StartCommitAnalysisRequest;
  }>(
    '/api/analysis/commit',

    async (
      request,
      reply
    ) => {

      const {
        projectId,
        branch,
        commitSha
      } =
        request.body ??
        {};


      if (
        !projectId
      ) {

        return reply
          .code(400)
          .send({
            message:
              'projectId is required'
          });

      }


      if (
        !branch
      ) {

        return reply
          .code(400)
          .send({
            message:
              'branch is required'
          });

      }


      if (
        !commitSha
      ) {

        return reply
          .code(400)
          .send({
            message:
              'commitSha is required'
          });

      }


      try {

        const result =
          await analysisService
            .analyzeCommit({

              projectId:
                Number(projectId),

              branch,

              commitSha

            });


        return result;

      }
      catch (error) {

        request.log.error(
          error
        );


        const message =
          error instanceof Error
            ? error.message
            : 'Error ejecutando análisis.';


        return reply
          .code(500)
          .send({
            message
          });

      }

    }
  );


  /*
   * GET ANALYSIS
   */
  app.get<{
    Params: {
      id: string;
    };
  }>(
    '/api/analysis/:id',

    async (
      request,
      reply
    ) => {

      const analysisId =
        Number(
          request.params.id
        );


      if (
        !Number.isInteger(
          analysisId
        ) ||
        analysisId <= 0
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Invalid analysis id'
          });

      }


      const analysis =
        await analysisService
          .getById(
            analysisId
          );


      if (!analysis) {

        return reply
          .code(404)
          .send({
            message:
              'Analysis not found'
          });

      }


      return analysis;

    }
  );

}