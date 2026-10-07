import {
  FastifyInstance
} from 'fastify';

import {
  ProjectService
} from './project.service';


export async function projectRoutes(
  app: FastifyInstance
) {

  const projectService =
    new ProjectService();


  // GET ALL
  app.get(
    '/api/projects',

    async () => {

      return projectService.getAll();

    }
  );


  // GET BY ID
  app.get<{
    Params: {
      id: string;
    };
  }>(
    '/api/projects/:id',

    async (
      request,
      reply
    ) => {

      const projectId =
        Number(request.params.id);


      if (
        Number.isNaN(projectId)
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Invalid project id'
          });

      }


      const project =
        await projectService
          .getById(projectId);


      if (!project) {

        return reply
          .code(404)
          .send({
            message:
              'Project not found'
          });

      }


      return project;

    }
  );


  // POST
  app.post<{
    Body: {
      name: string;
      description?: string;
      projectType: string;
      provider: string;
      repositoryUrl?: string;
      localPath?: string;
      defaultBranch?: string;
      technologies?: string[];
    };
  }>(
    '/api/projects',

    async (
      request,
      reply
    ) => {

      const body =
        request.body;


      if (
        !body.name?.trim()
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Project name is required'
          });

      }


      if (
        !body.projectType
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Project type is required'
          });

      }


      if (
        !body.provider
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Provider is required'
          });

      }


      const project =
        await projectService
          .create(body);


      return reply
        .code(201)
        .send(project);

    }
  );


  // DELETE / SOFT DELETE
  app.delete<{
    Params: {
      id: string;
    };
  }>(
    '/api/projects/:id',

    async (
      request,
      reply
    ) => {

      const projectId =
        Number(
          request.params.id
        );


      if (
        Number.isNaN(projectId)
      ) {

        return reply
          .code(400)
          .send({
            message:
              'Invalid project id'
          });

      }


      const deleted =
        await projectService
          .delete(projectId);


      if (!deleted) {

        return reply
          .code(404)
          .send({
            message:
              'Project not found'
          });

      }


      return reply
        .code(200)
        .send({
          message:
            'Project deleted successfully'
        });

    }
  );

}