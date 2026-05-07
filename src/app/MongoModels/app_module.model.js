// Collection: app_modules
const mongoose = require('mongoose');
const { Schema } = mongoose;

const AppModuleSchema = new Schema(
  {
    key:         { type: String, required: true, unique: true, trim: true },
    label:       { type: String, required: true },
    description: { type: String, default: '' },
    isEnabled:   { type: Boolean, default: false },
    enabledAt:   { type: Date, default: null },
    disabledAt:  { type: Date, default: null },
    enabledBy:   { type: Schema.Types.ObjectId, default: null },
    config:      { type: Object, default: {} },
  },
  {
    collection: 'app_modules',
    timestamps: true,
  }
);

AppModuleSchema.index({ isEnabled: 1 });

module.exports = mongoose.models.AppModule || mongoose.model('AppModule', AppModuleSchema);
