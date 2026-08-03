import { defineConfig, loadEnv } from 'vite';

function githubPagesBase(repository: string | undefined): string {
  const repositoryName = repository?.split('/')[1];
  // A repository named `<owner>.github.io` is a root Pages site. Every other
  // GitHub Pages repository is published below its repository-name prefix.
  return repositoryName && !repositoryName.endsWith('.github.io')
    ? `/${repositoryName}/`
    : '/';
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'GITHUB_');

  return {
    base: githubPagesBase(environment.GITHUB_REPOSITORY),
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  };
});
