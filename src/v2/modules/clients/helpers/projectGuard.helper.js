const projectRepository = require('../../projects/repositories/project.repository');

async function clientHasActiveProjects(clientId) {
  const count = await projectRepository.countActiveByClientId(clientId);
  return count > 0;
}

module.exports = {
  clientHasActiveProjects,
};
