import Fastify from 'fastify';
import cors from '@fastify/cors';

import {
  githubRoutes
} from './modules/github/github.routes';

import {
  getDatabase
} from './config/database';

import {
  projectRoutes
} from './modules/projects/project.routes';

import {
  analysisRoutes
} from './modules/analysis/analysis.routes';

import {
  findingRoutes
} from './modules/findings/finding.routes';

import {
  dashboardRoutes
} from './modules/dashboard/dashboard.routes';

import {
  impactAnalysisRoutes
} from './modules/analysis/impact-analysis.routes';

export function buildApp() {

  const app = Fastify({
    logger: true
  });


  app.register(cors, {

    origin: [
      'http://localhost:4200'
    ],

    methods: [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ]

  });


  app.get(
    '/health',

    async () => {

      return {

        status: 'ok',

        service: 'Code AI API',

        timestamp:
          new Date().toISOString()

      };

    }
  );


  app.get(
    '/health/database',

    async () => {

      const database =
        await getDatabase();


      const result =
        await database
          .request()
          .query(`
            SELECT
              DB_NAME() AS DatabaseName,
              GETDATE() AS ServerDate
          `);


      return {

        status: 'ok',

        database:
          result.recordset[0].DatabaseName,

        serverDate:
          result.recordset[0].ServerDate

      };

    }
  );


  // PROJECT ROUTES
  app.register(
    projectRoutes
  );


  // GITHUB ROUTES
  app.register(
    githubRoutes
  );

  app.register(
    analysisRoutes
  );

  app.register(
    findingRoutes
  );
  
  app.register(
    dashboardRoutes
  );

  app.register(
  impactAnalysisRoutes
  );

  return app;

}