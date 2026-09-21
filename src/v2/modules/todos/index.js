const routes = require('./todos.routes');
const { ensureTodoIndexes } = require('./models/todo.model');

module.exports = { routes, ensureTodoIndexes };
