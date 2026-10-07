import {
  FastifyInstance
} from 'fastify';

import {
  FindingService
} from './finding.service';


export async function findingRoutes(
  app: FastifyInstance
) {

  const findingService =
    new FindingService();


  /*
   * GET ALL
   */
  app.get<{
    Querystring: {

      projectId?: string;

      severity?: string;

      status?: string;

    };
  }>(
    '/api/findings',

    async (
      request,
      reply
    ) => {

      try {

        const projectId =
          request.query
            .projectId
            ? Number(
                request.query
                  .projectId
              )
            : undefined;


        const findings =
          await findingService
            .getAll({

              projectId,

              severity:
                request.query
                  .severity,

              status:
                request.query
                  .status

            });


        return findings;

      }
      catch (error) {

        request.log.error(
          error
        );


        const message =
          error instanceof Error
            ? error.message
            : 'Error consultando findings.';


        return reply
          .code(500)
          .send({
            message
          });

      }

    }
  );


  /*
   * GET BY ID
   */
  app.get<{
    Params: {
      id: string;
    };
  }>(
    '/api/findings/:id',

    async (
      request,
      reply
    ) => {

      const id =
        Number(
          request.params.id
        );


      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Invalid finding id'
          });

      }


      const finding =
        await findingService
          .getById(
            id
          );


      if (!finding) {

        return reply
          .code(404)
          .send({
            message:
              'Finding not found'
          });

      }


      return finding;

    }
  );


  /*
   * UPDATE STATUS
   */
  app.patch<{
    Params: {
      id: string;
    };

    Body: {
      status?: string;
    };
  }>(
    '/api/findings/:id/status',

    async (
      request,
      reply
    ) => {

      const id =
        Number(
          request.params.id
        );


      const status =
        request.body
          ?.status
          ?.trim();


      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Invalid finding id'
          });

      }


      if (!status) {

        return reply
          .code(400)
          .send({
            message:
              'status is required'
          });

      }


      try {

        const updated =
          await findingService
            .updateStatus(
              id,
              status
            );


        if (!updated) {

          return reply
            .code(404)
            .send({
              message:
                'Finding not found'
            });

        }


        return {
          success: true
        };

      }
      catch (error) {

        const message =
          error instanceof Error
            ? error.message
            : 'Error actualizando finding.';


        return reply
          .code(400)
          .send({
            message
          });

      }

    }
  );

}