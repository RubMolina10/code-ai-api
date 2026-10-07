import {
  FastifyInstance
} from 'fastify';

import {
  ImpactAnalysisService
} from './impact-analysis.service';

import {
  StartCommitAnalysisRequest
} from './analysis.types';


export async function impactAnalysisRoutes(
  app: FastifyInstance
) {

  const impactAnalysisService =
    new ImpactAnalysisService();


  app.post<{
    Body:
      StartCommitAnalysisRequest;
  }>(
    '/api/analysis/impact',

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

        return await impactAnalysisService
          .analyzeImpact({

            projectId:
              Number(
                projectId
              ),

            branch,

            commitSha

          });

      }
      catch (error) {

        request.log.error(
          error
        );


        return reply
          .code(500)
          .send({

            message:
              error instanceof Error
                ? error.message
                : 'Error ejecutando Impact Analysis.'

          });

      }

    }
  );

}