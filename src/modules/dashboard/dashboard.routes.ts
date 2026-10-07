import {
  FastifyInstance
} from 'fastify';

import {
  DashboardService
} from './dashboard.service';


export async function dashboardRoutes(
  app: FastifyInstance
) {

  const dashboardService =
    new DashboardService();


  /*
   * DASHBOARD
   */
  app.get(
    '/api/dashboard',

    async (
      request,
      reply
    ) => {

      try {

        return await dashboardService
          .getDashboard();

      }
      catch (error) {

        request.log.error(
          error
        );


        const message =
          error instanceof Error
            ? error.message
            : 'Error cargando dashboard.';


        return reply
          .code(500)
          .send({
            message
          });

      }

    }
  );

}