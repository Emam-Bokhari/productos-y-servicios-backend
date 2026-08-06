import { model, Schema } from "mongoose";
import { RULE_TYPE, TRule, RuleModel } from "./rule.interface";
import { softDeletePlugin } from "../../../DB/plugins/softDeletePlugin";

const ruleSchema = new Schema<TRule>(
  {
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: Object.values(RULE_TYPE),
      select: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ruleSchema.plugin(softDeletePlugin);

export const Rule = model<TRule, RuleModel>("Rule", ruleSchema);
