export interface GithubBranch {

  name: string;

  sha: string;

  protected: boolean;

}


export interface GithubCommit {

  sha: string;

  shortSha: string;

  message: string;

  authorName: string;

  authorEmail: string;

  authorLogin?: string;

  date: string;

  url: string;

}


export interface GithubCommitFile {

  filename: string;

  status: string;

  additions: number;

  deletions: number;

  changes: number;

  patch?: string;

  rawUrl?: string;

  blobUrl?: string;

}


export interface GithubCommitDetail {

  sha: string;

  shortSha: string;

  message: string;

  authorName: string;

  authorEmail: string;

  date: string;

  url: string;

  stats: {

    total: number;

    additions: number;

    deletions: number;

  };

  files: GithubCommitFile[];

}


interface GithubBranchResponse {

  name: string;

  commit: {
    sha: string;
  };

  protected: boolean;

}


interface GithubCommitResponse {

  sha: string;

  html_url: string;

  commit: {

    message: string;

    author: {

      name: string;

      email: string;

      date: string;

    } | null;

  };

  author: {

    login: string;

  } | null;

}


interface GithubCommitDetailResponse {

  sha: string;

  html_url: string;

  commit: {

    message: string;

    author: {

      name: string;

      email: string;

      date: string;

    } | null;

  };

  stats: {

    total: number;

    additions: number;

    deletions: number;

  };

  files: {

    filename: string;

    status: string;

    additions: number;

    deletions: number;

    changes: number;

    patch?: string;

    raw_url?: string;

    blob_url?: string;

  }[];

}

export interface GithubTreeFile {

  path: string;

  sha: string;

  size: number;

}


interface GithubTreeResponse {

  sha: string;

  truncated: boolean;

  tree: Array<{

    path: string;

    type: string;

    sha: string;

    size?: number;

  }>;

}


interface GithubBlobResponse {

  sha: string;

  size: number;

  encoding: string;

  content: string;

}

export class GithubService {

  /*
 * GET REPOSITORY TREE
 *
 * Obtiene todos los archivos de una rama.
 */
async getRepositoryTree(
  repositoryUrl: string,
  ref: string
): Promise<GithubTreeFile[]> {

  const {
    owner,
    repo
  } =
    this.getRepositoryInfo(
      repositoryUrl
    );


  if (
    !ref?.trim()
  ) {

    throw new Error(
      'La rama o referencia es requerida.'
    );

  }


  const apiUrl =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref.trim())}?recursive=1`;


  const response =
    await fetch(
      apiUrl,
      {
        method: 'GET',

        headers:
          this.getHeaders()
      }
    );


  if (
    response.status === 404
  ) {

    throw new Error(
      `No fue posible obtener el árbol de ${owner}/${repo} para ${ref}.`
    );

  }


  if (
    !response.ok
  ) {

    const errorBody =
      await response.text();


    throw new Error(
      `GitHub respondió con status ${response.status}: ${errorBody}`
    );

  }


  const data = (await response.json()) as GithubTreeResponse;


  /*
   * No queremos hacer un análisis parcial
   * creyendo que vimos todo el proyecto.
   */
  if (
    data.truncated
  ) {

    throw new Error(
      'El árbol del repositorio es demasiado grande para analizarlo completamente mediante GitHub API.'
    );

  }


  return data.tree

    .filter(
      item =>
        item.type ===
        'blob'
    )

    .map(
      item => ({

        path:
          item.path,

        sha:
          item.sha,

        size:
          item.size ??
          0

      })
    );

}


/*
 * GET BLOB CONTENT
 *
 * Obtiene el contenido real de un archivo
 * usando el SHA entregado por Git Trees.
 */
async getBlobContent(
  repositoryUrl: string,
  blobSha: string
): Promise<string> {

  const {
    owner,
    repo
  } =
    this.getRepositoryInfo(
      repositoryUrl
    );


  const apiUrl =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(blobSha)}`;


  const response =
    await fetch(
      apiUrl,
      {
        method: 'GET',

        headers:
          this.getHeaders()
      }
    );


  if (
    !response.ok
  ) {

    return '';

  }


  const data = (await response.json()) as GithubBlobResponse;


  if (
    data.encoding !==
    'base64'
  ) {

    return '';

  }


  try {

    const cleanContent =
      data.content
        .replace(
          /\n/g,
          ''
        );


    return Buffer
      .from(
        cleanContent,
        'base64'
      )
      .toString(
        'utf8'
      );

  }
  catch {

    return '';

  }

}

  private getRepositoryInfo(
    repositoryUrl: string
  ): {
    owner: string;
    repo: string;
  } {

    let url: URL;


    try {

      url =
        new URL(repositoryUrl);

    }
    catch {

      throw new Error(
        'La URL del repositorio no es válida.'
      );

    }


    if (
      url.hostname !== 'github.com' &&
      url.hostname !== 'www.github.com'
    ) {

      throw new Error(
        'El repositorio debe pertenecer a GitHub.'
      );

    }


    const parts =
      url.pathname
        .split('/')
        .filter(Boolean);


    if (
      parts.length < 2
    ) {

      throw new Error(
        'La URL de GitHub no contiene owner y repository.'
      );

    }


    const owner =
      parts[0];


    const repo =
      parts[1]
        .replace(
          /\.git$/i,
          ''
        );


    return {
      owner,
      repo
    };

  }


  private getHeaders():
    Record<string, string> {

    const headers:
      Record<string, string> = {

        Accept:
          'application/vnd.github+json',

        'X-GitHub-Api-Version':
          '2026-03-10',

        'User-Agent':
          'Code-AI-Dashboard'

      };


    const token =
      process.env.GITHUB_TOKEN;


    if (token) {

      headers.Authorization =
        `Bearer ${token}`;

    }


    return headers;

  }


  async getBranches(
    repositoryUrl: string
  ): Promise<GithubBranch[]> {

    const {
      owner,
      repo
    } =
      this.getRepositoryInfo(
        repositoryUrl
      );


    const branches:
      GithubBranch[] = [];


    let page = 1;


    while (true) {

      const apiUrl =
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`;


      const response =
        await fetch(
          apiUrl,
          {
            method: 'GET',

            headers:
              this.getHeaders()
          }
        );


      if (
        response.status === 404
      ) {

        throw new Error(
          'Repositorio no encontrado o sin permisos de acceso.'
        );

      }


      if (
        response.status === 403
      ) {

        throw new Error(
          'GitHub rechazó la solicitud. Puede faltar permiso o haberse alcanzado el límite de peticiones.'
        );

      }


      if (
        !response.ok
      ) {

        throw new Error(
          `GitHub respondió con status ${response.status}.`
        );

      }


      const data =
        (await response.json()) as GithubBranchResponse[];


      branches.push(
        ...data.map(
          branch => ({

            name:
              branch.name,

            sha:
              branch.commit.sha,

            protected:
              branch.protected

          })
        )
      );


      if (
        data.length < 100
      ) {

        break;

      }


      page++;

    }


    return branches;

  }


  async getCommits(
    repositoryUrl: string,
    branch: string
  ): Promise<GithubCommit[]> {

    const {
      owner,
      repo
    } =
      this.getRepositoryInfo(
        repositoryUrl
      );


    if (
      !branch?.trim()
    ) {

      throw new Error(
        'La rama es requerida.'
      );

    }


    const apiUrl =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=50`;


    const response =
      await fetch(
        apiUrl,
        {
          method: 'GET',

          headers:
            this.getHeaders()
        }
      );


    if (
      response.status === 404
    ) {

      throw new Error(
        'Repositorio o rama no encontrados.'
      );

    }


    if (
      response.status === 409
    ) {

      throw new Error(
        'El repositorio está vacío o no tiene commits disponibles.'
      );

    }


    if (
      response.status === 403
    ) {

      throw new Error(
        'GitHub rechazó la solicitud. Puede faltar permiso o haberse alcanzado el límite de peticiones.'
      );

    }


    if (
      !response.ok
    ) {

      throw new Error(
        `GitHub respondió con status ${response.status}.`
      );

    }


    const data =
      (await response.json()) as GithubCommitResponse[];


    return data.map(
      item => ({

        sha:
          item.sha,

        shortSha:
          item.sha.substring(
            0,
            8
          ),

        message:
          item.commit
            .message
            .split('\n')[0],

        authorName:
          item.commit
            .author
            ?.name ??
          item.author
            ?.login ??
          'Unknown',

        authorEmail:
          item.commit
            .author
            ?.email ??
          '',

        authorLogin:
          item.author
            ?.login,

        date:
          item.commit
            .author
            ?.date ??
          '',

        url:
          item.html_url

      })
    );

  }


  async getCommitDetail(
  repositoryUrl: string,
  sha: string
): Promise<GithubCommitDetail> {

  const {
    owner,
    repo
  } =
    this.getRepositoryInfo(
      repositoryUrl
    );


  if (
    !sha?.trim()
  ) {

    throw new Error(
      'El SHA del commit es requerido.'
    );

  }


  const cleanSha =
    sha.trim();


  const files:
    GithubCommitFile[] = [];


  let page = 1;

  let commitData:
    GithubCommitDetailResponse | null =
    null;


  while (true) {

    const apiUrl =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(cleanSha)}?per_page=100&page=${page}`;


    console.log(
      'GitHub commit request:',
      apiUrl
    );


    const response =
      await fetch(
        apiUrl,
        {
          method: 'GET',

          headers:
            this.getHeaders()
        }
      );


    /*
     * Si GitHub responde error,
     * mostramos el body real.
     */
    if (
      !response.ok
    ) {

      const githubError =
        await response.text();


      console.error(
        'GitHub commit error:',
        {
          status:
            response.status,

          repository:
            `${owner}/${repo}`,

          sha:
            cleanSha,

          response:
            githubError
        }
      );


      if (
        response.status === 404
      ) {

        throw new Error(
          `Commit no encontrado en ${owner}/${repo}. SHA: ${cleanSha}`
        );

      }


      if (
        response.status === 403
      ) {

        throw new Error(
          `GitHub rechazó la solicitud: ${githubError}`
        );

      }


      if (
        response.status === 422
      ) {

        throw new Error(
          `GitHub no pudo validar el commit ${cleanSha}: ${githubError}`
        );

      }


      throw new Error(
        `GitHub respondió con status ${response.status}: ${githubError}`
      );

    }


    const data =
      (await response.json()) as GithubCommitDetailResponse;


    if (
      commitData === null
    ) {

      commitData =
        data;

    }


    const pageFiles =
      data.files ?? [];


    files.push(
      ...pageFiles.map( file => ({

          filename:
            file.filename,

          status:
            file.status,

          additions:
            file.additions,

          deletions:
            file.deletions,

          changes:
            file.changes,

          patch:
            file.patch,

          rawUrl:
            file.raw_url,

          blobUrl:
            file.blob_url

        })
      )
    );


    /*
     * GitHub devuelve máximo
     * 100 archivos por página.
     */
    if (
      pageFiles.length < 100
    ) {

      break;

    }


    page++;

  }


  if (
    commitData === null
  ) {

    throw new Error(
      'No fue posible obtener la información del commit.'
    );

  }


  return {

    sha:
      commitData.sha,

    shortSha:
      commitData.sha.substring(
        0,
        8
      ),

    message:
      commitData.commit.message,

    authorName:
      commitData.commit
        .author
        ?.name ??
      'Unknown',

    authorEmail:
      commitData.commit
        .author
        ?.email ??
      '',

    date:
      commitData.commit
        .author
        ?.date ??
      '',

    url:
      commitData.html_url,

    stats: {

      total:
        commitData.stats.total,

      additions:
        commitData.stats.additions,

      deletions:
        commitData.stats.deletions

    },

    files

  };

}

}