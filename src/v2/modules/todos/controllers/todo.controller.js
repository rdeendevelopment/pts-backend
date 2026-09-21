const { asyncHandler } = require('../../../kernel/middleware');
const { sendSuccess } = require('../../../kernel/responses');
const service = require('../services/todo.service');

const create = async (req, res) => sendSuccess(res, await service.create(req, req.body), { status: 201 });
const list = async (req, res) => sendSuccess(res, await service.list(req, req.query));
const get = async (req, res) => sendSuccess(res, await service.get(req, req.params.id));
const update = async (req, res) => sendSuccess(res, await service.update(req, req.params.id, req.body));
const complete = async (req, res) => sendSuccess(res, await service.complete(req, req.params.id));
const reopen = async (req, res) => sendSuccess(res, await service.reopen(req, req.params.id));
const remove = async (req, res) => sendSuccess(res, await service.remove(req, req.params.id));
const moveToToday = async (req, res) => sendSuccess(res, await service.moveToToday(req, req.params.id, req.body.mode));
const summary = async (req, res) => sendSuccess(res, await service.summary(req, req.query));

module.exports = Object.fromEntries(Object.entries({ create, list, get, update, complete, reopen, remove, moveToToday, summary })
  .map(([key, handler]) => [key, asyncHandler(handler)]));
