module.exports = {
  extractPhase1TablesFromSqlFile: require('./parsers/sqlInsertStream.parser').extractPhase1TablesFromSqlFile,
  extractPhase2TablesFromSqlFile: require('./parsers/sqlInsertStream.parser').extractPhase2TablesFromSqlFile,
  runSqlPhase1Migration: require('./services/phase1Migration.service').runSqlPhase1Migration,
  runSqlPhase2Migration: require('./services/phase2Migration.service').runSqlPhase2Migration,
  rollbackSqlPhase1Run: require('./services/phase1Migration.service').rollbackSqlPhase1Run,
  rollbackSqlPhase2Run: require('./services/phase2Migration.service').rollbackSqlPhase2Run,
};
