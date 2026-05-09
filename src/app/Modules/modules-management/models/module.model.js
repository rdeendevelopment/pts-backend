const mongoose = require('mongoose');
const { Schema } = mongoose;

const SystemModuleSchema = new Schema(
  {
    key:              { type: String, required: true, unique: true, trim: true },
    name:             { type: String, required: true },
    description:      { type: String, default: '' },
    enabled:          { type: Boolean, default: true },
    order:            { type: Number, default: 0 },
    icon:             { type: String, default: '' },
    isCore:           { type: Boolean, default: false },
    controlledByRole: { type: String, default: 'super_admin' },
  },
  { collection: 'system_modules', timestamps: true }
);

SystemModuleSchema.index({ enabled: 1 });

module.exports = mongoose.models.SystemModule || mongoose.model('SystemModule', SystemModuleSchema);
