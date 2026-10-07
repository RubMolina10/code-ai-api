export interface CreateProjectRequest {

  name: string;

  description?: string;

  projectType: string;

  provider: string;

  repositoryUrl?: string;

  localPath?: string;

  defaultBranch?: string;

  technologies?: string[];

}