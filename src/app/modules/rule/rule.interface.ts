import { ISoftDeleteModel } from "../../../types/softDelete";

export enum RULE_TYPE {
  PRIVACY = "privacy",
  TERMS = "terms",
  ABOUT = "about",
}

export type TRule = {
  content: string;
  type: RULE_TYPE;
};

export type RuleModel = ISoftDeleteModel<TRule>;
