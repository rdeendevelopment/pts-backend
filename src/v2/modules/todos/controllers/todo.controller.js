const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const service = require('../services/todo.service');

const create = async (req, res) => sendSuccess(res, await service.create(req, req.body), { status: 201 });
const list = async (req, res) => sendSuccess(res, await service.list(req, req.query));
const get = async (req, res) => sendSuccess(res, await service.get(req, req.params.id));
const update = async (req, res) => sendSuccess(res, await service.update(req, req.params.id, req.body));
const complete = async (req, res) => sendSuccess(res, await service.complete(req, req.params.id, req.body?.completionMode));
const reopen = async (req, res) => sendSuccess(res, await service.reopen(req, req.params.id));
const remove = async (req, res) => sendSuccess(res, await service.remove(req, req.params.id));
const moveToToday = async (req, res) => sendSuccess(res, await service.moveToToday(req, req.params.id, req.body.mode));
const summary = async (req, res) => sendSuccess(res, await service.summary(req, req.query));
const report = async (req, res) => sendSuccess(res, await service.report(req, req.query));
const outstanding = async (req, res) => sendSuccess(res, await service.outstanding(req, req.query));
const moveAllOutstanding = async (req, res) => sendSuccess(res, await service.moveAllOutstanding(req, req.body));
const availableTasks = async (req, res) => sendSuccess(res, await service.availableTasks(req, req.query));
const addTasks = async (req, res) => sendSuccess(res, await service.addTasks(req, req.body), { status: 201 });

module.exports = Object.fromEntries(Object.entries({ create, list, get, update, complete, reopen, remove, moveToToday, summary, report, outstanding, moveAllOutstanding, availableTasks, addTasks })
  .map(([key, handler]) => [key, asyncHandler(handler)]));
