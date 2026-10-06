import {
  Project,
  Node,
  SourceFile,
  ObjectLiteralExpression,
  PropertyAssignment,
  ArrayLiteralExpression,
  CallExpression,
  SyntaxKind,
} from "ts-morph";
import * as path from "path";
import * as fs from "fs";

// ============================================================================
// CONFIGURABLE PATH HELPERS
// ============================================================================

/**
 * Root directory where module subdirectories live.
 * Override with ERD_SCHEMA_ROOT (absolute or project-relative path).
 * Default: <projectRoot>/src/app/modules
 */
function getSchemaRoot(): string {
  const projectRoot = path.resolve(__dirname, "..");
  if (process.env.ERD_SCHEMA_ROOT) {
    const r = process.env.ERD_SCHEMA_ROOT;
    return path.isAbsolute(r) ? r : path.resolve(projectRoot, r);
  }
  return path.join(projectRoot, "src", "app", "modules");
}

/**
 * Output directory for generated .drawio files.
 * Override with ERD_OUTPUT_DIR (absolute or project-relative path).
 * Default: <projectRoot>/docs/erd/modules
 */
function getOutputDir(): string {
  const projectRoot = path.resolve(__dirname, "..");
  if (process.env.ERD_OUTPUT_DIR) {
    const r = process.env.ERD_OUTPUT_DIR;
    return path.isAbsolute(r) ? r : path.resolve(projectRoot, r);
  }
  return path.join(projectRoot, "docs", "erd", "modules");
}

interface ExtractedField {
  name: string;
  type: string;
  required: boolean;
  unique: boolean;
  default?: string;
  enum?: string[];
  ref?: string;
  refPath?: string;
  index?: string | boolean;
  isNested?: boolean;
  nestedFields?: ExtractedField[];
}

interface ExtractedSchema {
  name: string; // Model name or sub-schema name
  collectionName?: string;
  moduleName: string;
  filePath: string;
  fields: ExtractedField[];
  plugins: string[];
  indexes: { fields: string; unique?: boolean }[];
  virtuals: {
    name: string;
    ref?: string;
    localField?: string;
    foreignField?: string;
    justOne?: boolean;
  }[];
  timestamps: boolean;
}

interface Relationship {
  source: string;
  target: string;
  type: "one-to-one" | "one-to-many";
  label: string;
}

// Clean up types for display
function cleanType(typeText: string): string {
  const text = typeText.trim();
  if (
    text.includes("ObjectId") ||
    text.includes("Schema.Types.ObjectId") ||
    text.includes("Types.ObjectId")
  ) {
    return "objectId";
  }
  if (text === "String" || text.toLowerCase() === "string") return "string";
  if (text === "Number" || text.toLowerCase() === "number") return "number";
  if (text === "Boolean" || text.toLowerCase() === "boolean") return "boolean";
  if (text === "Date" || text.toLowerCase() === "date") return "date";
  if (
    text === "Mixed" ||
    text.includes("Schema.Types.Mixed") ||
    text.includes("Types.Mixed")
  )
    return "mixed";

  // Array types
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    return `${cleanType(inner)}[]`;
  }

  return text;
}

// Resolve enum values by parsing enums/objects recursively in the project files
function resolveEnumValues(
  sourceFile: SourceFile,
  name: string,
): string[] | undefined {
  // 1. Look for enum in current file
  const enumDec = sourceFile.getEnum(name);
  if (enumDec) {
    return enumDec.getMembers().map((m) => {
      const val = m.getValue();
      return typeof val === "string" ? val : m.getName();
    });
  }

  // 2. Look for const variable in current file
  const varDec = sourceFile.getVariableDeclaration(name);
  if (varDec) {
    const init = varDec.getInitializer();
    if (init && Node.isObjectLiteralExpression(init)) {
      const values: string[] = [];
      for (const p of init.getProperties()) {
        if (Node.isPropertyAssignment(p)) {
          const valNode = p.getInitializer();
          if (valNode && Node.isStringLiteral(valNode)) {
            values.push(valNode.getLiteralValue());
          } else if (valNode) {
            values.push(valNode.getText());
          }
        }
      }
      return values;
    }
  }

  // 3. Look in import declarations
  for (const imp of sourceFile.getImportDeclarations()) {
    const namedImports = imp.getNamedImports().map((ni) => ni.getName());
    if (namedImports.includes(name)) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      const project = sourceFile.getProject();
      const currentDir = sourceFile.getDirectoryPath();

      const absolutePath = path.resolve(currentDir, moduleSpecifier);
      const possiblePaths = [
        absolutePath + ".ts",
        absolutePath + "/index.ts",
        path.join(
          path.dirname(absolutePath),
          path.basename(absolutePath) + ".ts",
        ),
        absolutePath,
      ];

      for (const p of possiblePaths) {
        const resolvedFile = project.getSourceFile(p);
        if (resolvedFile) {
          const vals = resolveEnumValues(resolvedFile, name);
          if (vals) return vals;
        }
      }
    }
  }
  return undefined;
}

// Helper to extract enum values from field options
function extractEnum(sourceFile: SourceFile, node: Node): string[] | undefined {
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().map((el) => {
      if (Node.isStringLiteral(el)) return el.getLiteralValue();
      return el.getText();
    });
  }
  if (Node.isCallExpression(node)) {
    // e.g., Object.values(USER_ROLES)
    const exprText = node.getText();
    if (exprText.startsWith("Object.values(")) {
      const match = exprText.match(/Object\.values\(([^)]+)\)/);
      if (match) {
        const enumName = match[1].trim();
        return resolveEnumValues(sourceFile, enumName);
      }
    }
  }
  if (Node.isIdentifier(node)) {
    return resolveEnumValues(sourceFile, node.getText());
  }
  return undefined;
}

const MONGOOSE_FIELD_OPTIONS = new Set([
  "type",
  "required",
  "unique",
  "default",
  "enum",
  "index",
  "sparse",
  "ref",
  "select",
  "validate",
  "set",
  "get",
  "trim",
  "lowercase",
  "uppercase",
  "match",
  "min",
  "max",
  "minlength",
  "maxlength",
  "alias",
  "timestamps",
  "auto",
  "expires",
]);

function isMongooseFieldDefinition(
  objLiteral: ObjectLiteralExpression,
): boolean {
  const typeProp = objLiteral.getProperty("type");
  if (!typeProp) return false;

  // Check if there are other keys that are not standard mongoose options
  for (const prop of objLiteral.getProperties()) {
    if (Node.isPropertyAssignment(prop)) {
      const name = prop.getName();
      if (!MONGOOSE_FIELD_OPTIONS.has(name)) {
        return false;
      }
    }
  }
  return true;
}

function parseFieldInitializer(
  fieldName: string,
  initializer: Node,
  sourceFile: SourceFile,
): ExtractedField | null {
  // Case 1: Simple type e.g., String, Schema.Types.ObjectId
  if (
    Node.isIdentifier(initializer) ||
    Node.isPropertyAccessExpression(initializer)
  ) {
    return {
      name: fieldName,
      type: cleanType(initializer.getText()),
      required: false,
      unique: false,
    };
  }

  // Case 2: Array e.g., [String] or [{ type: Schema.Types.ObjectId, ref: 'User' }]
  if (Node.isArrayLiteralExpression(initializer)) {
    const elements = initializer.getElements();
    if (elements.length > 0) {
      const el = elements[0];
      if (Node.isObjectLiteralExpression(el)) {
        // Is it a field definition inside array? E.g., [{ type: String, required: true }]
        if (isMongooseFieldDefinition(el)) {
          const parsed = parseFieldInitializer(fieldName, el, sourceFile);
          if (parsed) {
            parsed.type = `${parsed.type}[]`;
            return parsed;
          }
        } else {
          // Array of embedded documents
          const nestedFields = parseSchemaObject(el, sourceFile);
          return {
            name: fieldName,
            type: "object[]",
            required: false,
            unique: false,
            isNested: true,
            nestedFields,
          };
        }
      } else {
        // Array of simple type
        return {
          name: fieldName,
          type: `${cleanType(el.getText())}[]`,
          required: false,
          unique: false,
        };
      }
    }
    return {
      name: fieldName,
      type: "array",
      required: false,
      unique: false,
    };
  }

  // Case 3: Object Literal e.g., { type: String, required: true } or nested objects
  if (Node.isObjectLiteralExpression(initializer)) {
    if (isMongooseFieldDefinition(initializer)) {
      const typeProp = initializer.getProperty("type");
      if (typeProp && Node.isPropertyAssignment(typeProp)) {
        const typeInit = typeProp.getInitializer();
        if (typeInit) {
          if (Node.isObjectLiteralExpression(typeInit)) {
            // It is a nested object wrapped in 'type', e.g. fieldName: { type: { prop1: Type, prop2: Type }, select: 0 }
            const nestedFields = parseSchemaObject(typeInit, sourceFile);
            return {
              name: fieldName,
              type: "object",
              required: false,
              unique: false,
              isNested: true,
              nestedFields,
            };
          } else if (Node.isArrayLiteralExpression(typeInit)) {
            // It is an array wrapped in 'type', e.g. fieldName: { type: [Number], required: true }
            const parsedArray = parseFieldInitializer(
              fieldName,
              typeInit,
              sourceFile,
            );
            if (parsedArray) {
              // Copy other constraints from outer object literal to the parsed array field
              for (const p of initializer.getProperties()) {
                if (!Node.isPropertyAssignment(p)) continue;
                const name = p.getName();
                const initVal = p.getInitializer();
                if (!initVal) continue;

                if (name === "required") {
                  if (Node.isArrayLiteralExpression(initVal)) {
                    const first = initVal.getElements()[0];
                    parsedArray.required = first?.getText() === "true";
                  } else {
                    parsedArray.required = initVal.getText() === "true";
                  }
                } else if (name === "unique") {
                  parsedArray.unique = initVal.getText() === "true";
                } else if (name === "ref") {
                  parsedArray.ref = initVal.getText().replace(/['"]/g, "");
                } else if (name === "refPath") {
                  parsedArray.refPath = initVal.getText().replace(/['"]/g, "");
                } else if (name === "default") {
                  parsedArray.default = initVal.getText();
                } else if (name === "enum") {
                  parsedArray.enum = extractEnum(sourceFile, initVal);
                } else if (name === "index") {
                  parsedArray.index = initVal.getText();
                }
              }
              return parsedArray;
            }
          }
        }

        const typeText = typeInit?.getText() || "mixed";
        const field: ExtractedField = {
          name: fieldName,
          type: cleanType(typeText),
          required: false,
          unique: false,
        };

        // Extract constraints
        for (const p of initializer.getProperties()) {
          if (!Node.isPropertyAssignment(p)) continue;
          const name = p.getName();
          const initVal = p.getInitializer();
          if (!initVal) continue;

          if (name === "required") {
            if (Node.isArrayLiteralExpression(initVal)) {
              const first = initVal.getElements()[0];
              field.required = first?.getText() === "true";
            } else {
              field.required = initVal.getText() === "true";
            }
          } else if (name === "unique") {
            field.unique = initVal.getText() === "true";
          } else if (name === "ref") {
            field.ref = initVal.getText().replace(/['"]/g, "");
          } else if (name === "refPath") {
            field.refPath = initVal.getText().replace(/['"]/g, "");
          } else if (name === "default") {
            field.default = initVal.getText();
          } else if (name === "enum") {
            field.enum = extractEnum(sourceFile, initVal);
          } else if (name === "index") {
            field.index = initVal.getText();
          }
        }
        return field;
      }
    }

    // Otherwise, treat as a nested object (embedded document)
    const nestedFields = parseSchemaObject(initializer, sourceFile);
    return {
      name: fieldName,
      type: "object",
      required: false,
      unique: false,
      isNested: true,
      nestedFields,
    };
  }

  return null;
}

function parseSchemaObject(
  objLiteral: ObjectLiteralExpression,
  sourceFile: SourceFile,
): ExtractedField[] {
  const fields: ExtractedField[] = [];
  for (const property of objLiteral.getProperties()) {
    if (Node.isPropertyAssignment(property)) {
      const fieldName = property.getName();
      const initializer = property.getInitializer();
      if (!initializer) continue;

      const parsed = parseFieldInitializer(fieldName, initializer, sourceFile);
      if (parsed) {
        fields.push(parsed);
      }
    }
  }
  return fields;
}

export function analyzeFile(
  sourceFile: SourceFile,
  moduleName: string,
): ExtractedSchema[] {
  const schemas: ExtractedSchema[] = [];
  const schemaVarToModelMap = new Map<string, string>();
  const modelToSchemaMap = new Map<string, ExtractedSchema>();

  // 1. Find all Schema variable definitions: const xSchema = new Schema(...)
  const newExpressions = sourceFile
    .getDescendants()
    .filter(Node.isNewExpression);
  for (const newExpr of newExpressions) {
    const constructorText = newExpr.getExpression().getText();
    if (
      constructorText === "Schema" ||
      constructorText === "mongoose.Schema" ||
      constructorText.endsWith(".Schema")
    ) {
      // Find the VariableDeclaration parent
      const varDec = newExpr.getFirstAncestor(Node.isVariableDeclaration);
      const schemaVarName = varDec ? varDec.getName() : "AnonymousSchema";

      const args = newExpr.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0];
      const secondArg = args[1];

      let fields: ExtractedField[] = [];
      if (Node.isObjectLiteralExpression(firstArg)) {
        fields = parseSchemaObject(firstArg, sourceFile);
      }

      let timestamps = false;
      if (secondArg && Node.isObjectLiteralExpression(secondArg)) {
        const tsProp = secondArg.getProperty("timestamps");
        if (tsProp && Node.isPropertyAssignment(tsProp)) {
          timestamps = tsProp.getInitializer()?.getText() === "true";
        }
      }

      const schema: ExtractedSchema = {
        name: schemaVarName, // temporary name
        moduleName,
        filePath: sourceFile.getFilePath(),
        fields,
        plugins: [],
        indexes: [],
        virtuals: [],
        timestamps,
      };

      modelToSchemaMap.set(schemaVarName, schema);
    }
  }

  // 2. Find schema extensions: xSchema.plugin(...), xSchema.index(...), xSchema.virtual(...)
  const callExpressions = sourceFile
    .getDescendants()
    .filter(Node.isCallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (Node.isPropertyAccessExpression(expr)) {
      const leftName = expr.getExpression().getText();
      const rightName = expr.getName();
      const schema = modelToSchemaMap.get(leftName);

      if (schema) {
        const args = call.getArguments();
        if (rightName === "plugin" && args.length > 0) {
          schema.plugins.push(args[0].getText());
        } else if (rightName === "index" && args.length > 0) {
          const idxFields = args[0].getText();
          let unique = false;
          if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
            const uniqProp = args[1].getProperty("unique");
            if (uniqProp && Node.isPropertyAssignment(uniqProp)) {
              unique = uniqProp.getInitializer()?.getText() === "true";
            }
          }
          schema.indexes.push({ fields: idxFields, unique });
        } else if (rightName === "virtual" && args.length > 0) {
          const virtualName = args[0].getText().replace(/['"]/g, "");
          const virtualInfo: {
            name: string;
            ref?: string;
            localField?: string;
            foreignField?: string;
            justOne?: boolean;
          } = { name: virtualName };

          if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
            const opts = args[1];
            const refProp = opts.getProperty("ref");
            const localProp = opts.getProperty("localField");
            const foreignProp = opts.getProperty("foreignField");
            const justOneProp = opts.getProperty("justOne");

            if (refProp && Node.isPropertyAssignment(refProp)) {
              virtualInfo.ref = refProp
                .getInitializer()
                ?.getText()
                .replace(/['"]/g, "");
            }
            if (localProp && Node.isPropertyAssignment(localProp)) {
              virtualInfo.localField = localProp
                .getInitializer()
                ?.getText()
                .replace(/['"]/g, "");
            }
            if (foreignProp && Node.isPropertyAssignment(foreignProp)) {
              virtualInfo.foreignField = foreignProp
                .getInitializer()
                ?.getText()
                .replace(/['"]/g, "");
            }
            if (justOneProp && Node.isPropertyAssignment(justOneProp)) {
              virtualInfo.justOne =
                justOneProp.getInitializer()?.getText() === "true";
            }
          }
          schema.virtuals.push(virtualInfo);
        }
      }
    }
  }

  // 3. Find model calls: model("ModelName", schemaVar) or mongoose.model("ModelName", schemaVar)
  for (const call of callExpressions) {
    const expr = call.getExpression();
    const isModelCall =
      expr.getText() === "model" ||
      expr.getText() === "mongoose.model" ||
      expr.getText().endsWith(".model");

    if (isModelCall) {
      const args = call.getArguments();
      if (args.length >= 2) {
        const modelName = args[0].getText().replace(/['"]/g, "");
        const schemaArg = args[1];

        if (Node.isIdentifier(schemaArg)) {
          const schemaVarName = schemaArg.getText();
          schemaVarToModelMap.set(schemaVarName, modelName);
        } else if (Node.isNewExpression(schemaArg)) {
          // Direct inline Schema definition
          const schemaObj = schemaArg.getArguments()[0];
          let fields: ExtractedField[] = [];
          if (schemaObj && Node.isObjectLiteralExpression(schemaObj)) {
            fields = parseSchemaObject(schemaObj, sourceFile);
          }

          let timestamps = false;
          const optsObj = schemaArg.getArguments()[1];
          if (optsObj && Node.isObjectLiteralExpression(optsObj)) {
            const tsProp = optsObj.getProperty("timestamps");
            if (tsProp && Node.isPropertyAssignment(tsProp)) {
              timestamps = tsProp.getInitializer()?.getText() === "true";
            }
          }

          const schema: ExtractedSchema = {
            name: modelName,
            moduleName,
            filePath: sourceFile.getFilePath(),
            fields,
            plugins: [],
            indexes: [],
            virtuals: [],
            timestamps,
          };
          schemas.push(schema);
        }
      }
    }
  }

  // Map variable-based schemas to their model names
  for (const [schemaVar, modelName] of schemaVarToModelMap.entries()) {
    const schema = modelToSchemaMap.get(schemaVar);
    if (schema) {
      schema.name = modelName;
      schemas.push(schema);
    }
  }

  // Export variable-based schemas that do not map to a top-level model (sub-schemas/embedded schemas)
  for (const [schemaVar, schema] of modelToSchemaMap.entries()) {
    if (!schemaVarToModelMap.has(schemaVar)) {
      schema.name = schemaVar;
      schemas.push(schema);
    }
  }

  return schemas;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ============================================================================
// ERD THEME & COLOR PALETTE CONFIGURATION
// Centralized theme object to customize all colors, contrast, and visual tokens.
// ============================================================================
export interface ErdTheme {
  name: "light" | "dark";
  canvas: {
    background: string;
  };
  groups: {
    core: { fill: string; stroke: string; title: string };
    lookup: { fill: string; stroke: string; title: string };
    dependent: { fill: string; stroke: string; title: string };
  };
  entities: {
    core: {
      headerFill: string;
      headerText: string;
      bodyFill: string;
      border: string;
    };
    lookup: {
      headerFill: string;
      headerText: string;
      bodyFill: string;
      border: string;
    };
    dependent: {
      headerFill: string;
      headerText: string;
      bodyFill: string;
      border: string;
    };
  };
  badges: {
    pk: { fill: string; text: string };
    fk: { fill: string; text: string };
    idx: { fill: string; text: string };
    enum: { fill: string; text: string };
    uk: { fill: string; text: string };
  };
  rows: {
    pkHighlight: string;
    fkHighlight: string;
    primaryText: string;
    mutedText: string;
  };
  relationships: {
    foreignKey: string;
    embeddedOrLookup: string;
    interModule: string;
    labelBg: string;
    labelBorder: string;
    labelText: string;
  };
}

export const LIGHT_THEME: ErdTheme = {
  name: "light",
  canvas: {
    background: "#FFFFFF",
  },
  groups: {
    core: { fill: "#F5F3FF", stroke: "#C7D2FE", title: "#1E1B4B" },
    lookup: { fill: "#F0F9FF", stroke: "#BAE6FD", title: "#0F766E" },
    dependent: { fill: "#FFF7ED", stroke: "#FED7AA", title: "#9A3412" },
  },
  entities: {
    core: {
      headerFill: "#1E1B4B",
      headerText: "#FFFFFF",
      bodyFill: "#EEF2FF",
      border: "#4338CA",
    },
    lookup: {
      headerFill: "#0F766E",
      headerText: "#FFFFFF",
      bodyFill: "#F0FDFA",
      border: "#14B8A6",
    },
    dependent: {
      headerFill: "#B45309",
      headerText: "#FFFFFF",
      bodyFill: "#FFFBEB",
      border: "#F59E0B",
    },
  },
  badges: {
    pk: { fill: "#FBBF24", text: "#1F2937" }, // Gold/Amber fill with dark text (Contrast 10.5:1)
    fk: { fill: "#2563EB", text: "#FFFFFF" }, // Blue fill with white text (Contrast 4.8:1)
    idx: { fill: "#16A34A", text: "#FFFFFF" }, // Green fill with white text (Contrast 4.6:1)
    enum: { fill: "#7C3AED", text: "#FFFFFF" }, // Purple fill with white text (Contrast 4.7:1)
    uk: { fill: "#0891B2", text: "#FFFFFF" }, // Teal/Cyan fill with white text (Contrast 4.6:1)
  },
  rows: {
    pkHighlight: "#FEF3C7", // Faint warm amber tint
    fkHighlight: "#DBEAFE", // Faint blue tint
    primaryText: "#111827", // WCAG AA compliant dark text (>12:1)
    mutedText: "#4B5563", // WCAG AA compliant muted text (>6.5:1 on light fills)
  },
  relationships: {
    foreignKey: "#2563EB", // Blue for FK references
    embeddedOrLookup: "#7C3AED", // Purple for embedded/$lookup
    interModule: "#64748B", // Slate for inter-module / shared
    labelBg: "#FFFFFF",
    labelBorder: "#CBD5E1",
    labelText: "#0F172A",
  },
};

export const DARK_THEME: ErdTheme = {
  name: "dark",
  canvas: {
    background: "#0F172A",
  },
  groups: {
    core: { fill: "#1E1B4B", stroke: "#3730A3", title: "#E0E7FF" },
    lookup: { fill: "#042F2E", stroke: "#115E59", title: "#99F6E4" },
    dependent: { fill: "#451A03", stroke: "#92400E", title: "#FED7AA" },
  },
  entities: {
    core: {
      headerFill: "#312E81",
      headerText: "#FFFFFF",
      bodyFill: "#1E1B4B",
      border: "#6366F1",
    },
    lookup: {
      headerFill: "#115E59",
      headerText: "#FFFFFF",
      bodyFill: "#042F2E",
      border: "#2DD4BF",
    },
    dependent: {
      headerFill: "#78350F",
      headerText: "#FFFFFF",
      bodyFill: "#451A03",
      border: "#F59E0B",
    },
  },
  badges: {
    pk: { fill: "#F59E0B", text: "#1F2937" },
    fk: { fill: "#3B82F6", text: "#FFFFFF" },
    idx: { fill: "#22C55E", text: "#052E16" },
    enum: { fill: "#A855F7", text: "#FFFFFF" },
    uk: { fill: "#06B6D4", text: "#083344" },
  },
  rows: {
    pkHighlight: "#78350F33",
    fkHighlight: "#1E3A8A33",
    primaryText: "#F8FAFC",
    mutedText: "#94A3B8",
  },
  relationships: {
    foreignKey: "#60A5FA",
    embeddedOrLookup: "#C084FC",
    interModule: "#94A3B8",
    labelBg: "#1E293B",
    labelBorder: "#475569",
    labelText: "#F1F5F9",
  },
};

export function getActiveTheme(): ErdTheme {
  const isDark = process.env.ERD_THEME === "dark";
  return isDark ? DARK_THEME : LIGHT_THEME;
}

/**
 * Insert zero-width spaces (\u200B) after safe break-opportunity characters so that
 * long unbroken tokens (e.g. enum values joined by '|') can wrap inside the cell.
 * The visible text is character-for-character identical; only break opportunities are added.
 * Safe delimiters: | / \ , ; _ – these never appear as the last visible character of a token.
 */
function insertBreakOpportunities(text: string): string {
  // Insert a zero-width space after safe delimiters (| / \ , ; _ - .) when not followed by whitespace or break.
  return text.replace(/([|/\\,;_\-.])(?=[^\s\u200B])/g, "$1\u200B");
}

/**
 * Estimate a row's rendered height based on the visible text and the available column width.
 *
 * Algorithm:
 * 1. Measure badge extra horizontal footprint (padding + margins).
 * 2. Strip all HTML tags to get visible plain text.
 * 3. Expand break opportunities (\u200B inserted by insertBreakOpportunities).
 * 4. Split into word-wrap tokens (split at spaces and zero-width spaces).
 * 5. Word-wrap those tokens into lines that fit the usable column width.
 * 6. Return 28px (single-line height) + 15px per extra line.
 *
 * Rows that produce exactly one line keep height 28, so entities without wrapped text
 * stay geometrically identical.
 */
function estimateRowHeight(labelHtml: string, colWidth: number): number {
  const usableWidth = colWidth - 22; // 10px left + 10px right spacing + 2px border

  // Extract badges to measure their width accurately
  let badgeExtraWidth = 0;
  const badgeMatches = labelHtml.match(
    /<span style="background-color:[^>]+>([^<]+)<\/span>/g,
  );
  if (badgeMatches) {
    badgeExtraWidth = badgeMatches.length * 15;
  }

  // 1. Strip HTML tags
  const plainText = labelHtml.replace(/<[^>]+>/g, "");

  // 2. Expand break opportunities
  const breakExpanded = insertBreakOpportunities(plainText);

  // 3. Split into word-wrap tokens
  const tokens = breakExpanded.split(/[\s\u200B]+/).filter(Boolean);

  const CHAR_WIDTH = 6.2;
  const SPACE_WIDTH = 3.5;
  let lines = 1;
  let lineWidth = badgeExtraWidth;

  for (const tok of tokens) {
    const tokWidth = tok.length * CHAR_WIDTH;
    if (lineWidth === 0) {
      lineWidth = tokWidth;
    } else if (lineWidth + SPACE_WIDTH + tokWidth <= usableWidth) {
      lineWidth += SPACE_WIDTH + tokWidth;
    } else {
      lines++;
      lineWidth = tokWidth;
    }
    // Handle overlong tokens that wrap due to overflow-wrap:anywhere
    while (lineWidth > usableWidth) {
      lines++;
      lineWidth -= usableWidth;
    }
  }

  if (lines <= 1) return 28;
  return 28 + (lines - 1) * 15;
}

interface FieldLabelInfo {
  id: string;
  labelHtml: string;
  isPk?: boolean;
  isFk?: boolean;
}

function getFieldLabels(
  schema: ExtractedSchema,
  entName: string,
): FieldLabelInfo[] {
  const list: FieldLabelInfo[] = [];
  const theme = getActiveTheme();

  const badgeStyle = (bg: string, fg: string) =>
    `background-color:${bg};color:${fg};padding:1px 5px;font-size:9px;font-weight:bold;border-radius:3px;margin-left:5px;display:inline-block;line-height:1.2;`;

  const pkBadge = `<span style="${badgeStyle(theme.badges.pk.fill, theme.badges.pk.text)}">PK</span>`;
  const fkBadge = `<span style="${badgeStyle(theme.badges.fk.fill, theme.badges.fk.text)}">FK</span>`;
  const ukBadge = `<span style="${badgeStyle(theme.badges.uk.fill, theme.badges.uk.text)}">UK</span>`;
  const idxBadge = `<span style="${badgeStyle(theme.badges.idx.fill, theme.badges.idx.text)}">IDX</span>`;
  const enumBadge = `<span style="${badgeStyle(theme.badges.enum.fill, theme.badges.enum.text)}">ENUM</span>`;

  // 1. _id field
  list.push({
    id: `field_${entName}__id`,
    labelHtml: `<b>_id</b>: <span style="color:${theme.rows.mutedText};"><b>objectId</b></span> ${pkBadge}`,
    isPk: true,
  });

  // 2. Regular fields
  const addFields = (fields: ExtractedField[], prefix = "") => {
    for (const field of fields) {
      if (field.name === "_id") continue;
      if (field.isNested && field.type === "object[]") continue;
      if (field.isNested && field.type === "object" && field.nestedFields) {
        addFields(field.nestedFields, `${prefix}${field.name}_`);
        continue;
      }

      const cleanFieldName = `${prefix}${field.name}`.replace(
        /[^a-zA-Z0-9_]/g,
        "_",
      );

      // Required fields: Bold name
      const nameHtml = field.required
        ? `<b>${cleanFieldName}</b>`
        : cleanFieldName;

      // Foreign Keys: Italic type
      const rawType = cleanType(field.type);
      const brokenType = insertBreakOpportunities(rawType);
      const typeText = field.ref ? `<i>${brokenType}</i>` : brokenType;

      const isFk = !!(field.ref || field.refPath);

      let badges = "";
      if (field.unique) {
        badges += ukBadge;
      }
      if (isFk) {
        badges += fkBadge;
      }
      if (field.index) {
        badges += idxBadge;
      }
      if (field.enum && field.enum.length > 0) {
        badges += enumBadge;
      }

      const comments: string[] = [];
      if (field.default !== undefined) {
        comments.push(
          `def: ${insertBreakOpportunities(field.default.replace(/"/g, "'"))}`,
        );
      }
      if (field.enum && field.enum.length > 0) {
        const cleanEnums = field.enum.map((ev) => ev.replace(/"/g, "'"));
        // Insert break opportunities after pipe characters so long enum strings wrap.
        const enumStr = insertBreakOpportunities(
          `enum: ${cleanEnums.join("|")}`,
        );
        comments.push(enumStr);
      }

      const commentStr =
        comments.length > 0
          ? ` <span style="color:${theme.rows.mutedText}; font-size:10px; font-style:italic;">(${comments.join(", ")})</span>`
          : "";
      const labelHtml = `${nameHtml}: <span style="color:${theme.rows.mutedText};">${typeText}</span>${badges}${commentStr}`;

      list.push({
        id: `field_${entName}_${cleanFieldName}`,
        labelHtml,
        isPk: false,
        isFk,
      });
    }
  };
  addFields(schema.fields);

  // 3. Timestamps
  if (schema.timestamps) {
    list.push({
      id: `field_${entName}_createdAt`,
      labelHtml: `<b>createdAt</b>: <span style="color:${theme.rows.mutedText};">date</span>`,
    });
    list.push({
      id: `field_${entName}_updatedAt`,
      labelHtml: `<b>updatedAt</b>: <span style="color:${theme.rows.mutedText};">date</span>`,
    });
  }

  return list;
}

// ----------------------------------------------------
// GRAPH LAYOUT OPTIMIZATION (Crossing Reduction)
// ----------------------------------------------------

function ccw(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number },
): boolean {
  return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
}

function intersect(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number },
  D: { x: number; y: number },
): boolean {
  return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

function countCrossings(
  positions: Map<string, { x: number; y: number }>,
  edges: { source: string; target: string }[],
): number {
  let crossings = 0;
  const edgeList = edges
    .map((e) => {
      const p1 = positions.get(e.source);
      const p2 = positions.get(e.target);
      return { p1, p2, source: e.source, target: e.target };
    })
    .filter((e) => e.p1 !== undefined && e.p2 !== undefined) as {
    p1: { x: number; y: number };
    p2: { x: number; y: number };
    source: string;
    target: string;
  }[];

  for (let i = 0; i < edgeList.length; i++) {
    const e1 = edgeList[i];
    for (let j = i + 1; j < edgeList.length; j++) {
      const e2 = edgeList[j];
      // Skip if sharing an endpoint
      if (
        e1.source === e2.source ||
        e1.source === e2.target ||
        e1.target === e2.source ||
        e1.target === e2.target
      ) {
        continue;
      }
      if (intersect(e1.p1, e1.p2, e2.p1, e2.p2)) {
        crossings++;
      }
    }
  }
  return crossings;
}

function getLayoutPositions(
  columns: string[][],
  tableHeights: Map<string, number>,
  colWidth: number,
  horizontalSpacing: number,
  verticalSpacing: number,
  paddingX: number,
  paddingTop: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const columnContainerWidth = colWidth + 2 * paddingX;

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const tables = columns[colIdx];
    const colX = colIdx * (columnContainerWidth + horizontalSpacing);
    let currentY = paddingTop;

    for (const tableName of tables) {
      const tHeight = tableHeights.get(tableName) || 100;
      const centerX = colX + paddingX + colWidth / 2;
      const centerY = currentY + tHeight / 2;
      positions.set(tableName, { x: centerX, y: centerY });
      currentY += tHeight + verticalSpacing;
    }
  }
  return positions;
}

function optimizeLayout(
  columns: string[][],
  tableHeights: Map<string, number>,
  edges: { source: string; target: string }[],
  colWidth: number,
  horizontalSpacing: number,
  verticalSpacing: number,
  paddingX: number,
  paddingTop: number,
): string[][] {
  const bestColumns = columns.map((col) => [...col]);
  let bestPositions = getLayoutPositions(
    bestColumns,
    tableHeights,
    colWidth,
    horizontalSpacing,
    verticalSpacing,
    paddingX,
    paddingTop,
  );

  const getEdgeLength = (positions: Map<string, { x: number; y: number }>) => {
    let length = 0;
    for (const edge of edges) {
      const p1 = positions.get(edge.source);
      const p2 = positions.get(edge.target);
      if (p1 && p2) {
        length += Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
      }
    }
    return length;
  };

  const getCost = (positions: Map<string, { x: number; y: number }>) => {
    const crossings = countCrossings(positions, edges);
    const edgeLength = getEdgeLength(positions);
    return crossings * 100000 + edgeLength;
  };

  let bestCost = getCost(bestPositions);
  let improved = true;
  let iterations = 0;
  const maxIterations = 2000;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    const colIdx = Math.floor(Math.random() * bestColumns.length);
    const col = bestColumns[colIdx];
    if (col.length < 2) continue;

    const idx1 = Math.floor(Math.random() * col.length);
    let idx2 = Math.floor(Math.random() * col.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * col.length);
    }

    const temp = col[idx1];
    col[idx1] = col[idx2];
    col[idx2] = temp;

    const tempPositions = getLayoutPositions(
      bestColumns,
      tableHeights,
      colWidth,
      horizontalSpacing,
      verticalSpacing,
      paddingX,
      paddingTop,
    );
    const tempCost = getCost(tempPositions);

    if (tempCost < bestCost) {
      bestCost = tempCost;
      bestPositions = tempPositions;
      improved = true;
    } else {
      const temp2 = col[idx1];
      col[idx1] = col[idx2];
      col[idx2] = temp2;
    }
  }

  return bestColumns;
}

// ----------------------------------------------------
// LAYOUT HELPERS
// ----------------------------------------------------
// (getDomainGroupIndex and DOMAIN_NAMES removed: were hardcoded to this project's module names.
// Module ordering is now derived purely from cross-module relationship weights via local search.)

function findFieldByPath(
  fields: ExtractedField[],
  pathText: string,
): ExtractedField | undefined {
  const parts = pathText.split(".");
  let currentFields = fields;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const found = currentFields.find((f) => f.name === part);
    if (!found) return undefined;
    if (i === parts.length - 1) return found;
    if (found.nestedFields) {
      currentFields = found.nestedFields;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function partitionSchemas(
  nativeSchemas: ExtractedSchema[],
  relations: Relationship[],
): ExtractedSchema[][] {
  const maxEntities = 15;
  if (nativeSchemas.length <= maxEntities) {
    return [nativeSchemas];
  }

  const adj = new Map<string, Set<string>>();
  for (const s of nativeSchemas) {
    adj.set(s.name, new Set());
  }

  for (const r of relations) {
    if (adj.has(r.source) && adj.has(r.target)) {
      adj.get(r.source)!.add(r.target);
      adj.get(r.target)!.add(r.source);
    }
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const s of nativeSchemas) {
    if (!visited.has(s.name)) {
      const comp: string[] = [];
      const queue = [s.name];
      visited.add(s.name);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        comp.push(curr);
        for (const neighbor of adj.get(curr) || []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      components.push(comp);
    }
  }

  const finalGroups: ExtractedSchema[][] = [];
  for (const comp of components) {
    if (comp.length <= maxEntities) {
      const schemas = comp.map(
        (name) => nativeSchemas.find((s) => s.name === name)!,
      );
      finalGroups.push(schemas);
    } else {
      let currentChunk: string[] = [];
      for (const name of comp) {
        currentChunk.push(name);
        if (currentChunk.length === maxEntities) {
          finalGroups.push(
            currentChunk.map((n) => nativeSchemas.find((s) => s.name === n)!),
          );
          currentChunk = [];
        }
      }
      if (currentChunk.length > 0) {
        finalGroups.push(
          currentChunk.map((n) => nativeSchemas.find((s) => s.name === n)!),
        );
      }
    }
  }

  return finalGroups;
}

function buildDrawioDiagram(
  moduleName: string,
  nativeSchemas: ExtractedSchema[],
  allSchemasMap: Map<string, ExtractedSchema>,
  moduleMap: Map<string, string[]>,
  codeRelations: Relationship[] = [],
  isOverview: boolean = false,
): string {
  const schemasToRender = new Map<string, ExtractedSchema>();
  const relationships: Relationship[] = [];
  const nativeNames = new Set(nativeSchemas.map((s) => s.name));

  const isWhole = moduleName === "whole-er-diagram";

  // Add all native schemas to render
  for (const schema of nativeSchemas) {
    if (isOverview) {
      // In overview diagrams, render all entities as lightweight (only PK)
      schemasToRender.set(schema.name, {
        ...schema,
        fields: [
          { name: "_id", type: "objectId", required: true, unique: true },
        ],
        timestamps: false,
        indexes: [],
        virtuals: [],
      });
    } else {
      schemasToRender.set(schema.name, schema);
    }
  }

  // Find Depth=1 related schemas and relationships recursively
  const addTargetSchema = (targetName: string) => {
    if (!schemasToRender.has(targetName)) {
      const targetSchema = allSchemasMap.get(targetName);
      if (targetSchema) {
        // Shared entity from another module or overview: display only PK field
        schemasToRender.set(targetName, {
          ...targetSchema,
          fields: [
            { name: "_id", type: "objectId", required: true, unique: true },
          ],
          timestamps: false,
          indexes: [],
          virtuals: [],
        });
      } else {
        // Create a stub schema for boundary node
        schemasToRender.set(targetName, {
          name: targetName,
          moduleName: "shared",
          filePath: "",
          fields: [
            { name: "_id", type: "objectId", required: true, unique: true },
          ],
          plugins: [],
          indexes: [],
          virtuals: [],
          timestamps: false,
        });
      }
    }
  };

  // Add code-level relations (e.g. populate, $lookup)
  for (const rel of codeRelations) {
    const isRelevant =
      isWhole ||
      isOverview ||
      nativeNames.has(rel.source) ||
      nativeNames.has(rel.target);
    if (isRelevant) {
      relationships.push(rel);
      if (isWhole || isOverview) {
        addTargetSchema(rel.source);
        addTargetSchema(rel.target);
      } else {
        if (nativeNames.has(rel.source)) addTargetSchema(rel.target);
        if (nativeNames.has(rel.target)) addTargetSchema(rel.source);
      }
    }
  }

  for (const nativeSchema of nativeSchemas) {
    const checkFields = (
      fields: ExtractedField[],
      parentEntity: string,
      prefix = "",
    ) => {
      for (const field of fields) {
        const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;

        // 1. Direct references (ref)
        if (field.ref) {
          const targetName = field.ref;
          relationships.push({
            source: targetName,
            target: parentEntity,
            type:
              field.unique && !field.type.endsWith("[]")
                ? "one-to-one"
                : "one-to-many",
            label: fieldPath,
          });
          addTargetSchema(targetName);
        }

        // 2. Dynamic references (refPath)
        if (field.refPath) {
          const pathField = findFieldByPath(nativeSchema.fields, field.refPath);
          if (pathField && pathField.enum && pathField.enum.length > 0) {
            for (const modelName of pathField.enum) {
              relationships.push({
                source: modelName,
                target: parentEntity,
                type: "one-to-many",
                label: `${fieldPath} (refPath: ${field.refPath})`,
              });
              addTargetSchema(modelName);
            }
          }
        }

        // 3. Embedded sub-schemas matching defined schemas
        const cleanTypeVal = field.type.replace(/\[\]$/, "");
        if (allSchemasMap.has(cleanTypeVal) && cleanTypeVal !== parentEntity) {
          relationships.push({
            source: parentEntity,
            target: cleanTypeVal,
            type: field.type.endsWith("[]") ? "one-to-many" : "one-to-one",
            label: fieldPath,
          });
          addTargetSchema(cleanTypeVal);
        }

        // Recurse into nested fields (e.g. nested objects or embedded schemas)
        if (field.isNested && field.nestedFields) {
          if (field.type === "object[]") {
            const subEntityName = `${parentEntity}_${capitalize(field.name)}`;

            if (isOverview) {
              schemasToRender.set(subEntityName, {
                name: subEntityName,
                moduleName: nativeSchema.moduleName,
                filePath: nativeSchema.filePath,
                fields: [
                  {
                    name: "_id",
                    type: "objectId",
                    required: true,
                    unique: true,
                  },
                ],
                plugins: [],
                indexes: [],
                virtuals: [],
                timestamps: false,
              });
            } else {
              schemasToRender.set(subEntityName, {
                name: subEntityName,
                moduleName: nativeSchema.moduleName,
                filePath: nativeSchema.filePath,
                fields: field.nestedFields,
                plugins: [],
                indexes: [],
                virtuals: [],
                timestamps: false,
              });
            }

            relationships.push({
              source: parentEntity,
              target: subEntityName,
              type: "one-to-many",
              label: field.name,
            });

            // Recurse inside the sub-entity fields
            checkFields(field.nestedFields, subEntityName, "");
          } else {
            // Recurse within the same parent entity
            checkFields(field.nestedFields, parentEntity, fieldPath);
          }
        }
      }
    };

    checkFields(nativeSchema.fields, nativeSchema.name);

    // Virtual populates
    for (const virt of nativeSchema.virtuals) {
      if (virt.ref && virt.localField && virt.foreignField) {
        const targetName = virt.ref;
        relationships.push({
          source: nativeSchema.name,
          target: targetName,
          type: virt.justOne ? "one-to-one" : "one-to-many",
          label: `${virt.name} (virtual)`,
        });
        addTargetSchema(targetName);
      }
    }
  }

  const sortedEntityNames = Array.from(schemasToRender.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const colWidth = 340;
  const schemaInfos = new Map<
    string,
    {
      labels: FieldLabelInfo[];
      heights: number[];
      totalHeight: number;
    }
  >();

  for (const entName of sortedEntityNames) {
    const schema = schemasToRender.get(entName)!;
    const labels = getFieldLabels(schema, entName);
    const heights = labels.map((l) => estimateRowHeight(l.labelHtml, colWidth));
    const totalHeight = 38 + heights.reduce((sum, h) => sum + h, 0);
    schemaInfos.set(entName, { labels, heights, totalHeight });
  }

  // Calculate dynamic spacing rules based on sizing density
  const totalEntities = sortedEntityNames.length;
  const totalRels = relationships.length;
  let scale = 1.0;
  if (totalEntities > 30 || totalRels > 30) {
    scale = 1.25;
  }
  if (totalEntities > 60 || totalRels > 60) {
    scale = 1.5;
  }

  const horizontalSpacing = Math.round(300 * scale);
  const verticalSpacing = Math.round(200 * scale);

  const paddingX = 30;
  const paddingTop = 60;
  const paddingBottom = 30;
  const leftMargin = 100;
  const topMargin = 100;
  const bottomMargin = 100;

  const columnContainerWidth = colWidth + 2 * paddingX;

  // Initialize columns and filter active columns
  let columns: string[][] = [];
  let colTitles: string[] = [];
  const leftTablesSet = new Set<string>();
  const centerTablesSet = new Set<string>();
  const rightTablesSet = new Set<string>();
  const parentPrimaryTargetY = new Map<string, number>();
  const depPrimaryCenterY = new Map<string, number>();

  if (isWhole) {
    // Dynamically identify all active modules present in the schemas being rendered
    const activeModules = Array.from(
      new Set(Array.from(schemasToRender.values()).map((s) => s.moduleName)),
    )
      .filter((m) => m !== "shared")
      .sort();

    if (
      Array.from(schemasToRender.values()).some(
        (s) => s.moduleName === "shared",
      )
    ) {
      activeModules.push("shared");
    }

    columns = Array.from({ length: activeModules.length }, () => []);
    colTitles = activeModules.map((modName) => {
      if (modName === "shared") return "Shared / External Dependencies";
      return `${capitalize(modName)} Module`;
    });

    for (const entName of sortedEntityNames) {
      const schema = schemasToRender.get(entName)!;
      const colIdx = activeModules.indexOf(schema.moduleName);
      if (colIdx !== -1) {
        columns[colIdx].push(entName);
      }
    }
  } else {
    columns = Array.from({ length: 3 }, () => []);
    colTitles = [
      "Parent Lookups / External Dependencies",
      isOverview
        ? `${capitalize(moduleName)} Core & Overview`
        : `Core Module: ${capitalize(moduleName)}`,
      "Dependent Entities & Sub-Schemas",
    ];

    const leftTables: string[] = [];
    const centerTables: string[] = [];
    const rightTables: string[] = [];

    for (const entName of sortedEntityNames) {
      if (nativeNames.has(entName)) {
        centerTables.push(entName);
      } else {
        const isLookup = relationships.some(
          (rel) => rel.source === entName && nativeNames.has(rel.target),
        );
        if (isLookup) {
          leftTables.push(entName);
        } else {
          rightTables.push(entName);
        }
      }
    }

    columns[0] = leftTables;
    columns[1] = centerTables;
    columns[2] = rightTables;

    for (const t of leftTables) leftTablesSet.add(t);
    for (const t of centerTables) centerTablesSet.add(t);
    for (const t of rightTables) rightTablesSet.add(t);

    // Calculate vertical offset of each entity within center column
    const centerEntityOffsets = new Map<string, number>();
    let cOffsetY = paddingTop;
    for (const cName of centerTables) {
      centerEntityOffsets.set(cName, cOffsetY);
      const cInfo = schemaInfos.get(cName);
      cOffsetY += (cInfo ? cInfo.totalHeight : 100) + verticalSpacing;
    }

    // ── PARENT-TO-CHILD LOOKUP VERTICAL ORDERING ───────────────────────────
    // Order parent entities strictly by the vertical position of the child's FK rows
    const parentPrimaryTargetY = new Map<string, number>();
    for (const parentName of leftTables) {
      const targetYs: number[] = [];
      for (const rel of relationships) {
        if (rel.source !== parentName || !centerTablesSet.has(rel.target))
          continue;
        const cOffset = centerEntityOffsets.get(rel.target) ?? paddingTop;
        const cleanTF = rel.label.replace(/[^a-zA-Z0-9_]/g, "_");
        const targetCellId = `field_${rel.target}_${cleanTF}`;

        const tgtInfo = schemaInfos.get(rel.target);
        let rowRelY = 38;
        if (tgtInfo) {
          let found = false;
          for (let i = 0; i < tgtInfo.labels.length; i++) {
            const h = tgtInfo.heights[i];
            if (tgtInfo.labels[i].id === targetCellId) {
              rowRelY += h / 2;
              found = true;
              break;
            }
            rowRelY += h;
          }
          if (!found) {
            rowRelY = tgtInfo.totalHeight / 2;
          }
        }
        targetYs.push(cOffset + rowRelY);
      }

      if (targetYs.length > 0) {
        targetYs.sort((a, b) => a - b);
        parentPrimaryTargetY.set(parentName, targetYs[0]);
      } else {
        parentPrimaryTargetY.set(parentName, 999999);
      }
    }
    leftTables.sort(
      (a, b) =>
        (parentPrimaryTargetY.get(a) ?? 0) - (parentPrimaryTargetY.get(b) ?? 0),
    );

    // ── DEPENDENT / SUB-SCHEMA VERTICAL ORDERING ───────────────────────────
    // Order dependent entities strictly by the vertical position of their source row in center
    const depPrimaryCenterY = new Map<string, number>();
    for (const depName of rightTables) {
      const centerYs: number[] = [];
      for (const rel of relationships) {
        let centerName: string | null = null;
        let centerField = "";
        if (rel.source === depName && centerTablesSet.has(rel.target)) {
          centerName = rel.target;
          centerField = rel.label;
        } else if (centerTablesSet.has(rel.source) && rel.target === depName) {
          centerName = rel.source;
          centerField = rel.label;
        }
        if (!centerName) continue;
        const cOffset = centerEntityOffsets.get(centerName) ?? paddingTop;
        const cleanCF = centerField.replace(/[^a-zA-Z0-9_]/g, "_");
        const centerCellId = `field_${centerName}_${cleanCF}`;

        const cInfo = schemaInfos.get(centerName);
        let rowRelY = 38;
        if (cInfo) {
          let found = false;
          for (let i = 0; i < cInfo.labels.length; i++) {
            const h = cInfo.heights[i];
            if (cInfo.labels[i].id === centerCellId) {
              rowRelY += h / 2;
              found = true;
              break;
            }
            rowRelY += h;
          }
          if (!found) {
            rowRelY = cInfo.totalHeight / 2;
          }
        }
        centerYs.push(cOffset + rowRelY);
      }

      if (centerYs.length > 0) {
        centerYs.sort((a, b) => a - b);
        depPrimaryCenterY.set(depName, centerYs[0]);
      } else {
        depPrimaryCenterY.set(depName, 999999);
      }
    }
    rightTables.sort(
      (a, b) =>
        (depPrimaryCenterY.get(a) ?? 0) - (depPrimaryCenterY.get(b) ?? 0),
    );

    columns[0] = leftTables;
    columns[1] = centerTables;
    columns[2] = rightTables;

    // Filter empty columns
    const activeColumns: string[][] = [];
    const activeTitles: string[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i].length > 0) {
        activeColumns.push(columns[i]);
        activeTitles.push(colTitles[i]);
      }
    }
    columns = activeColumns;
    colTitles = activeTitles;
  }

  if (isWhole) {
    // Optimize vertical layout of tables in each column to minimize crossing and length
    columns = optimizeLayout(
      columns,
      new Map(
        Array.from(schemaInfos.entries()).map(([k, v]) => [k, v.totalHeight]),
      ),
      relationships,
      colWidth,
      horizontalSpacing,
      verticalSpacing,
      paddingX,
      paddingTop,
    );
  }

  const is3ColPerModule = !isWhole && !isOverview && columns.length >= 2;
  const tableRelativePositions = new Map<string, { rx: number; ry: number }>();
  const tableParentIds = new Map<string, string>();

  // Assign table relative positions inside their column containers
  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const cardId = `column_${colIdx}`;
    const tables = columns[colIdx];
    let currentRelY = paddingTop;

    const isParentCol =
      is3ColPerModule && tables.length > 0 && leftTablesSet.has(tables[0]);
    const isDepCol =
      is3ColPerModule && tables.length > 0 && rightTablesSet.has(tables[0]);

    if (isParentCol || isDepCol) {
      // Place each parent/dependent near its connecting rows so edges are short and horizontal
      for (let i = 0; i < tables.length; i++) {
        const tName = tables[i];
        const tHeight = schemaInfos.get(tName)!.totalHeight;
        const targetY = isParentCol
          ? parentPrimaryTargetY.get(tName)
          : depPrimaryCenterY.get(tName);
        let relY = currentRelY;
        if (targetY !== undefined && targetY < 900000) {
          const idealY = Math.max(paddingTop, Math.round(targetY - 52));
          relY = Math.max(currentRelY, idealY);
        }
        tableRelativePositions.set(tName, { rx: paddingX, ry: relY });
        tableParentIds.set(tName, cardId);
        currentRelY = relY + tHeight + verticalSpacing;
      }
    } else {
      for (let i = 0; i < tables.length; i++) {
        const tName = tables[i];
        tableRelativePositions.set(tName, { rx: paddingX, ry: currentRelY });
        tableParentIds.set(tName, cardId);
        currentRelY += schemaInfos.get(tName)!.totalHeight + verticalSpacing;
      }
    }
  }

  // Calculate layout coordinates
  const columnHeights = columns.map((col, colIdx) => {
    if (col.length === 0) return 0;
    const isParentCol =
      is3ColPerModule && col.length > 0 && leftTablesSet.has(col[0]);
    const isDepCol =
      is3ColPerModule && col.length > 0 && rightTablesSet.has(col[0]);

    if (isParentCol || isDepCol) {
      let lastBottom = paddingTop;
      for (const tName of col) {
        const rpos = tableRelativePositions.get(tName);
        const tHeight = schemaInfos.get(tName)!.totalHeight;
        if (rpos) {
          lastBottom = Math.max(lastBottom, rpos.ry + tHeight);
        }
      }
      return lastBottom + paddingBottom;
    }
    let h = paddingTop;
    for (let i = 0; i < col.length; i++) {
      const entName = col[i];
      h += schemaInfos.get(entName)!.totalHeight;
      if (i < col.length - 1) {
        h += verticalSpacing;
      }
    }
    h += paddingBottom;
    return h;
  });

  // Determine dynamic canvas size and coordinates using grid if isWhole
  const numColumns = columns.length;
  const maxColsPerRow = 6;
  const colsPerRow = isWhole ? Math.min(maxColsPerRow, numColumns) : numColumns;
  const numRows = Math.ceil(numColumns / colsPerRow);

  const rowHeights: number[] = [];
  const rowYPositions: number[] = [];
  let currentY = topMargin;

  for (let r = 0; r < numRows; r++) {
    const rowColHeights = columnHeights.slice(
      r * colsPerRow,
      (r + 1) * colsPerRow,
    );
    const rowH = Math.max(...rowColHeights, 100);
    rowHeights.push(rowH);
    rowYPositions.push(currentY);
    // Vertical spacing between grid rows
    currentY += rowH + verticalSpacing * 2;
  }

  const pageCols = Math.min(numColumns, colsPerRow);
  const pageWidth = Math.round(
    leftMargin +
      pageCols * (columnContainerWidth + horizontalSpacing) -
      horizontalSpacing +
      leftMargin,
  );
  const pageHeight = Math.round(currentY - verticalSpacing * 2 + bottomMargin);

  const theme = getActiveTheme();

  // XML construction
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<mxfile host="Electron" modified="${new Date().toISOString()}" agent="Antigravity" version="24.0.0" type="device">\n`;
  xml += `  <diagram id="Page-1" name="Page-1">\n`;
  xml += `    <mxGraphModel dx="1422" dy="804" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0" background="${theme.canvas.background}">\n`;
  xml += `      <root>\n`;
  xml += `        <mxCell id="0" />\n`;
  xml += `        <mxCell id="1" parent="0" />\n`;

  // Draw column containers (domains/categories)
  for (let colIdx = 0; colIdx < numColumns; colIdx++) {
    const title = colTitles[colIdx];
    const colHeight = columnHeights[colIdx] || 100;

    const r = Math.floor(colIdx / colsPerRow);
    const c = colIdx % colsPerRow;

    const is3Col = !isWhole && !isOverview;
    const startY = is3Col
      ? rowYPositions[r]
      : Math.round(rowYPositions[r] + (rowHeights[r] - colHeight) / 2);
    const finalColHeight = is3Col ? rowHeights[r] : colHeight;
    const colX = Math.round(
      leftMargin + c * (columnContainerWidth + horizontalSpacing),
    );
    const cardId = `column_${colIdx}`;

    let groupTheme = theme.groups.core;
    if (
      title.includes("Parent Lookups") ||
      title.includes("External Dependencies") ||
      title.includes("Shared")
    ) {
      groupTheme = theme.groups.lookup;
    } else if (title.includes("Dependent") || title.includes("Sub-Schemas")) {
      groupTheme = theme.groups.dependent;
    }

    const containerStyle = `rounded=1;whiteSpace=wrap;html=1;fillColor=${groupTheme.fill};strokeColor=${groupTheme.stroke};strokeWidth=1.5;dashed=1;arcSize=6;align=left;verticalAlign=top;spacingLeft=15;spacingTop=12;fontColor=${groupTheme.title};fontSize=14;fontStyle=1;container=1;collapsible=0;recursiveResize=0;`;

    xml += `        <mxCell id="${cardId}" value="${escapeXml(title)}" style="${containerStyle}" vertex="1" parent="1">\n`;
    xml += `          <mxGeometry x="${colX}" y="${startY}" width="${columnContainerWidth}" height="${finalColHeight}" as="geometry" />\n`;
    xml += `        </mxCell>\n`;
  }

  // Set of all defined cell IDs (for validation)
  const definedCellIds = new Set<string>();
  definedCellIds.add("0");
  definedCellIds.add("1");
  for (let colIdx = 0; colIdx < numColumns; colIdx++) {
    definedCellIds.add(`column_${colIdx}`);
  }

  for (const entName of sortedEntityNames) {
    const tableId = `table_${entName}`;
    definedCellIds.add(tableId);
    definedCellIds.add(`field_${entName}__id`);
    definedCellIds.add(`field_${entName}_createdAt`);
    definedCellIds.add(`field_${entName}_updatedAt`);

    const schema = schemasToRender.get(entName)!;
    const addFieldsToIds = (fields: ExtractedField[], prefix = "") => {
      for (const field of fields) {
        if (field.name === "_id") continue;
        if (field.isNested && field.type === "object[]") continue;
        if (field.isNested && field.type === "object" && field.nestedFields) {
          addFieldsToIds(field.nestedFields, `${prefix}${field.name}_`);
          continue;
        }
        const cleanFieldName = `${prefix}${field.name}`.replace(
          /[^a-zA-Z0-9_]/g,
          "_",
        );
        definedCellIds.add(`field_${entName}_${cleanFieldName}`);
      }
    };
    addFieldsToIds(schema.fields);
  }

  // Draw tables and fields inside their column parents
  for (const entName of sortedEntityNames) {
    const schema = schemasToRender.get(entName)!;
    const rpos = tableRelativePositions.get(entName)!;
    const parentId = tableParentIds.get(entName)!;
    const info = schemaInfos.get(entName)!;
    const tableId = `table_${entName}`;

    const isNative = isWhole || nativeNames.has(entName);

    let entityRole: "core" | "lookup" | "dependent" = "core";
    if (isWhole) {
      if (schema.moduleName === "shared") {
        entityRole = "lookup";
      } else if (entName.includes("_")) {
        entityRole = "dependent";
      } else {
        entityRole = "core";
      }
    } else {
      if (leftTablesSet.has(entName)) {
        entityRole = "lookup";
      } else if (rightTablesSet.has(entName)) {
        entityRole = "dependent";
      } else {
        entityRole = "core";
      }
    }

    const entTheme = theme.entities[entityRole];
    const isDashed = !isNative;
    // collapsible=0 suppresses the draw.io collapse toggle icon (no geometry change).
    const tableStyle = `swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=38;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${entTheme.headerFill};swimlaneFillColor=${entTheme.bodyFill};strokeColor=${entTheme.border};strokeWidth=2;${isDashed ? "dashed=1;" : ""}fontColor=${entTheme.headerText};fontSize=13;align=center;`;

    xml += `        <mxCell id="${tableId}" value="${escapeXml(entName)}" style="${tableStyle}" vertex="1" parent="${parentId}">\n`;
    xml += `          <mxGeometry x="${rpos.rx}" y="${rpos.ry}" width="${colWidth}" height="${info.totalHeight}" as="geometry" />\n`;
    xml += `        </mxCell>\n`;

    let currentY = 38;
    for (let i = 0; i < info.labels.length; i++) {
      const fLabel = info.labels[i];
      const fHeight = info.heights[i];

      let rowBg = "none";
      if (fLabel.isPk) {
        rowBg = theme.rows.pkHighlight;
      } else if (fLabel.isFk) {
        rowBg = theme.rows.fkHighlight;
      }

      // overflow=visible + overflow-wrap:anywhere: text is never clipped.
      // whiteSpace=wrap combined with the zero-width break opportunities we inserted
      // means the browser can break long enum/union strings at delimiter positions.
      const rowStyle = `text;strokeColor=none;fillColor=${rowBg};align=left;verticalAlign=top;spacingLeft=10;spacingRight=10;spacingTop=6;overflow=visible;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=11;fontColor=${theme.rows.primaryText};`;

      const wrappedHtml = `<div style="box-sizing:border-box; width:100%; overflow-wrap:anywhere; word-break:break-word;">${fLabel.labelHtml}</div>`;
      xml += `        <mxCell id="${fLabel.id}" value="${escapeXml(wrappedHtml)}" style="${rowStyle}" vertex="1" parent="${tableId}">\n`;
      xml += `          <mxGeometry y="${currentY}" width="${colWidth}" height="${fHeight}" as="geometry" />\n`;
      xml += `        </mxCell>\n`;
      currentY += fHeight;
    }
  }

  // ==========================================================================
  // RELATIONSHIP EDGE ROUTING
  // ==========================================================================
  //
  // DESIGN
  // ------
  // For the 3-column per-module layout (Left=parents, Center=native, Right=children)
  // we use a structured routing strategy so edges never share a visual segment:
  //
  //   1. PARENT ORDERING: Sort the left column by the mean Y of the center rows they
  //      connect to, so edges go top-left → top-center, bottom-left → bottom-center
  //      without crossing.
  //
  //   2. PER-LANE VERTICAL CHANNELS: Each edge from the same source entity gets a
  //      unique X offset in the inter-column gutter, spaced LANE_WIDTH px apart.
  //      This means no two edges from different sources (or different fields of the
  //      same source when they fan out) ever share a vertical segment.
  //
  //   3. LABEL PLACEMENT: Labels use labelPosition=right,align=left so they appear
  //      on the final horizontal segment entering the target row, never on a bend.
  //
  //   4. INTRA-COLUMN / other edges: routed with plain orthogonalEdgeStyle as before,
  //      with a per-pair DY offset to prevent visual overlap.
  //
  // CONSTANTS (all derived from layout constants above — no project-specific values)

  // Build absolute pixel coordinates for every entity and every field row.
  // We need these to compute lane assignments and waypoints.
  // coordinate: top-left of each entity block in page space.
  function getEntityPageXY(entName: string): { x: number; y: number } | null {
    const rpos = tableRelativePositions.get(entName);
    const parentId = tableParentIds.get(entName);
    if (!rpos || !parentId) return null;
    // Recover the column container's page-level x/y from our layout calculations
    const colIndexStr = parentId.replace("column_", "");
    const colIdx = parseInt(colIndexStr, 10);
    if (isNaN(colIdx)) return null;
    const r = Math.floor(colIdx / colsPerRow);
    const c = colIdx % colsPerRow;
    const is3Col = !isWhole && !isOverview;
    const containerX = Math.round(
      leftMargin + c * (columnContainerWidth + horizontalSpacing),
    );
    const containerY = is3Col
      ? rowYPositions[r]
      : Math.round(
          rowYPositions[r] +
            (rowHeights[r] - (columnHeights[colIdx] || 100)) / 2,
        );
    return { x: containerX + rpos.rx, y: containerY + rpos.ry };
  }

  // For a given entity and field ID, return the absolute Y center of that row.
  function getFieldRowAbsoluteY(
    entName: string,
    fieldCellId: string,
  ): number | null {
    const exy = getEntityPageXY(entName);
    if (!exy) return null;
    const info = schemaInfos.get(entName);
    if (!info) return null;
    // Header is 38px, then rows stack
    let y = exy.y + 38;
    for (let i = 0; i < info.labels.length; i++) {
      const h = info.heights[i];
      if (info.labels[i].id === fieldCellId) {
        return y + h / 2;
      }
      y += h;
    }
    // Fallback: center of entity
    return exy.y + info.totalHeight / 2;
  }

  const LANE_WIDTH = 14; // px between adjacent vertical lanes in the gutter
  const LANE_BASE_OFFSET = 30; // px from column edge to first lane center

  // Pre-assign lane indices for cross-column edges so that edges targeting lower rows
  // receive smaller X offsets (inner lanes). This ensures an edge vertical line never
  // crosses the horizontal entry segment of an edge entering a higher row!
  const parentToCenterLanes = new Map<string, number>();
  const centerToRightLanes = new Map<string, number>();

  if (!isWhole && !isOverview) {
    // Sort relationships so that:
    // 1. Edges from source entities appear in top-to-bottom order of source entities
    // 2. Edges from the same source entity appear in top-to-bottom order of target rows (tgtAbsY ascending)
    // This ensures fan-out exits in top-to-bottom order without self-crossing!
    relationships.sort((a, b) => {
      const aSrcY = getEntityPageXY(a.source)?.y ?? 0;
      const bSrcY = getEntityPageXY(b.source)?.y ?? 0;
      if (aSrcY !== bSrcY) return aSrcY - bSrcY;

      const aCleanTF = a.label.replace(/[^a-zA-Z0-9_]/g, "_");
      const aTgtId = definedCellIds.has(`field_${a.target}_${aCleanTF}`)
        ? `field_${a.target}_${aCleanTF}`
        : `table_${a.target}`;
      const aTgtY = getFieldRowAbsoluteY(a.target, aTgtId) ?? 0;

      const bCleanTF = b.label.replace(/[^a-zA-Z0-9_]/g, "_");
      const bTgtId = definedCellIds.has(`field_${b.target}_${bCleanTF}`)
        ? `field_${b.target}_${bCleanTF}`
        : `table_${b.target}`;
      const bTgtY = getFieldRowAbsoluteY(b.target, bTgtId) ?? 0;

      return aTgtY - bTgtY;
    });

    const p2cRels: { key: string; tgtY: number }[] = [];
    const c2rRels: { key: string; tgtY: number }[] = [];

    for (const rel of relationships) {
      const cleanTF = rel.label.replace(/[^a-zA-Z0-9_]/g, "_");
      const targetCellId = definedCellIds.has(`field_${rel.target}_${cleanTF}`)
        ? `field_${rel.target}_${cleanTF}`
        : `table_${rel.target}`;
      const tgtY = getFieldRowAbsoluteY(rel.target, targetCellId) ?? 0;
      const key = `${rel.source}-${rel.target}-${rel.label}`;

      if (
        leftTablesSet.has(rel.source) &&
        (nativeNames.has(rel.target) || centerTablesSet.has(rel.target))
      ) {
        p2cRels.push({ key, tgtY });
      } else if (
        (nativeNames.has(rel.source) || centerTablesSet.has(rel.source)) &&
        rightTablesSet.has(rel.target)
      ) {
        c2rRels.push({ key, tgtY });
      }
    }

    p2cRels.sort((a, b) => b.tgtY - a.tgtY);
    p2cRels.forEach((item, idx) => parentToCenterLanes.set(item.key, idx));

    c2rRels.sort((a, b) => b.tgtY - a.tgtY);
    c2rRels.forEach((item, idx) => centerToRightLanes.set(item.key, idx));
  }

  // Track per-source how many edges have been emitted, for within-source fanout
  const sourceEdgeCount = new Map<string, number>();

  // ── STEP 3: Emit edges ───────────────────────────────────────────────────────
  const renderedRelationships = new Set<string>();
  let edgeIdCounter = 1;
  const pairConnectionCount = new Map<string, number>();

  for (const rel of relationships) {
    const hasNativeNode =
      nativeNames.has(rel.source) || nativeNames.has(rel.target);
    if (!isWhole && !isOverview && !hasNativeNode) continue;

    if (!schemasToRender.has(rel.source) || !schemasToRender.has(rel.target)) {
      continue;
    }

    const key = `${rel.source}-${rel.target}-${rel.label}`;
    const reverseKey = `${rel.target}-${rel.source}-${rel.label}`;
    if (renderedRelationships.has(key) || renderedRelationships.has(reverseKey))
      continue;
    renderedRelationships.add(key);

    let sourceCellId = `field_${rel.source}__id`;
    if (!definedCellIds.has(sourceCellId)) {
      sourceCellId = `table_${rel.source}`;
    }

    const cleanTargetField = rel.label.replace(/[^a-zA-Z0-9_]/g, "_");
    let targetCellId = `field_${rel.target}_${cleanTargetField}`;
    if (!definedCellIds.has(targetCellId)) {
      targetCellId = `table_${rel.target}`;
    }

    if (
      !definedCellIds.has(sourceCellId) ||
      !definedCellIds.has(targetCellId)
    ) {
      continue;
    }

    const edgeId = `edge_${edgeIdCounter++}`;
    const startArrow = "ERone";
    const endArrow = rel.type === "one-to-one" ? "ERone" : "ERmany";

    const sourceSchema = schemasToRender.get(rel.source);
    const targetSchema = schemasToRender.get(rel.target);
    const sourceModule = sourceSchema ? sourceSchema.moduleName : "shared";
    const targetModule = targetSchema ? targetSchema.moduleName : "shared";
    const isIntraModule = sourceModule === targetModule;

    let relColor = theme.relationships.foreignKey;
    const isLookupOrVirtual =
      rel.label.includes("$lookup") ||
      rel.label.includes("virtual") ||
      rel.label.includes("refPath");
    if (isLookupOrVirtual) {
      relColor = theme.relationships.embeddedOrLookup;
    } else if (!isIntraModule) {
      relColor = theme.relationships.interModule;
    } else {
      relColor = theme.relationships.foreignKey;
    }

    const isDashed =
      isWhole || isOverview
        ? !(isIntraModule && sourceModule && sourceModule !== "shared")
        : !isIntraModule;
    const strokeWidth = isDashed ? 2 : 2.5;

    // Cross-column structured routing for 3-column per-module diagrams
    const isParentToCenterEdge =
      !isWhole &&
      !isOverview &&
      leftTablesSet.has(rel.source) &&
      (nativeNames.has(rel.target) || centerTablesSet.has(rel.target));

    const isCenterToRightEdge =
      !isWhole &&
      !isOverview &&
      (nativeNames.has(rel.source) || centerTablesSet.has(rel.source)) &&
      rightTablesSet.has(rel.target);

    if (isParentToCenterEdge || isCenterToRightEdge) {
      // ── Per-lane structured routing ────────────────────────────────────────
      const srcXY = getEntityPageXY(rel.source);
      const srcInfo = schemaInfos.get(rel.source);
      const tgtAbsY = getFieldRowAbsoluteY(rel.target, targetCellId);
      const tgtXY = getEntityPageXY(rel.target);

      if (srcXY && srcInfo && tgtAbsY !== null && tgtXY) {
        const srcRightX = srcXY.x + colWidth;
        const lane = isParentToCenterEdge
          ? (parentToCenterLanes.get(key) ?? 0)
          : (centerToRightLanes.get(key) ?? 0);
        const edgeX = srcRightX + LANE_BASE_OFFSET + (lane % 15) * LANE_WIDTH;

        const srcEdgeIdx = sourceEdgeCount.get(rel.source) || 0;
        sourceEdgeCount.set(rel.source, srcEdgeIdx + 1);
        const parentEdgesCount = relationships.filter(
          (r) =>
            r.source === rel.source &&
            (isParentToCenterEdge
              ? nativeNames.has(r.target) || centerTablesSet.has(r.target)
              : rightTablesSet.has(r.target)),
        ).length;
        const baseSrcY =
          getFieldRowAbsoluteY(rel.source, sourceCellId) ?? srcXY.y + 52;
        const fanoutOffset = (srcEdgeIdx - (parentEdgesCount - 1) / 2) * 8;
        const srcRowY = baseSrcY + fanoutOffset;

        // rounded=0 suppresses overlapping corner arc artifacts.
        const laneEdgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=0;html=1;strokeColor=${relColor};strokeWidth=${strokeWidth};${isDashed ? "dashed=1;" : ""}startArrow=${startArrow};startFill=0;endArrow=${endArrow};endFill=0;fontSize=10;fontColor=${theme.relationships.labelText};labelBackgroundColor=${theme.relationships.labelBg};labelBorderColor=${theme.relationships.labelBorder};exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;`;

        xml += `        <mxCell id="${edgeId}" value="${escapeXml(rel.label)}" style="${laneEdgeStyle}" edge="1" parent="1" source="${sourceCellId}" target="${targetCellId}">\n`;
        // x="1" anchors the label near the target row, offset shifts it 50px left and 10px above the line
        xml += `          <mxGeometry x="1" y="0" relative="1" as="geometry">\n`;
        xml += `            <Array as="points">\n`;
        xml += `              <mxPoint x="${Math.round(edgeX)}" y="${Math.round(srcRowY)}" />\n`;
        xml += `              <mxPoint x="${Math.round(edgeX)}" y="${Math.round(tgtAbsY)}" />\n`;
        xml += `            </Array>\n`;
        xml += `            <mxPoint as="offset" x="-50" y="-10" />\n`;
        xml += `          </mxGeometry>\n`;
        xml += `        </mxCell>\n`;
        continue;
      }
    }

    // ── Default routing for same-column, right-column and whole-diagram edges ──
    const pairKey =
      sourceCellId < targetCellId
        ? `${sourceCellId}-${targetCellId}`
        : `${targetCellId}-${sourceCellId}`;
    const connIndex = pairConnectionCount.get(pairKey) || 0;
    pairConnectionCount.set(pairKey, connIndex + 1);
    const offset = connIndex * 8;

    let edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${relColor};strokeWidth=${strokeWidth};${isDashed ? "dashed=1;" : ""}startArrow=${startArrow};startFill=0;endArrow=${endArrow};endFill=0;fontSize=10;fontColor=${theme.relationships.labelText};labelBackgroundColor=${theme.relationships.labelBg};labelBorderColor=${theme.relationships.labelBorder};`;
    if (offset !== 0) {
      edgeStyle += `exitY=0.5;exitDx=0;exitDy=${offset};entryY=0.5;entryDx=0;entryDy=${offset};`;
    }

    xml += `        <mxCell id="${edgeId}" value="${escapeXml(rel.label)}" style="${edgeStyle}" edge="1" parent="1" source="${sourceCellId}" target="${targetCellId}">\n`;
    xml += `          <mxGeometry relative="1" as="geometry" />\n`;
    xml += `        </mxCell>\n`;
  }

  xml += `      </root>\n`;
  xml += `    </mxGraphModel>\n`;
  xml += `  </diagram>\n`;
  xml += `</mxfile>\n`;

  return xml;
}

function buildOverviewDiagram(
  moduleName: string,
  partitionedSchemas: ExtractedSchema[][],
  codeRelations: Relationship[],
): string {
  const allPartitionSchemas: ExtractedSchema[] = [];
  for (const schemas of partitionedSchemas) {
    allPartitionSchemas.push(...schemas);
  }

  const allSchemasMap = new Map<string, ExtractedSchema>();
  for (const s of allPartitionSchemas) {
    allSchemasMap.set(s.name, s);
  }

  const moduleMap = new Map<string, string[]>();
  return buildDrawioDiagram(
    moduleName,
    allPartitionSchemas,
    allSchemasMap,
    moduleMap,
    codeRelations,
    true,
  );
}

function deleteOldMmdFiles(dir: string) {
  if (!fs.existsSync(dir)) return;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      deleteOldMmdFiles(filePath);
    } else if (file.endsWith(".mmd")) {
      fs.unlinkSync(filePath);
      console.log(`Deleted legacy Mermaid file: ${filePath}`);
    }
  }
}

function getCollectionName(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.endsWith("y")) {
    return lower.slice(0, -1) + "ies";
  }
  if (lower.endsWith("s")) {
    return lower + "es";
  }
  return lower + "s";
}

export function extractRelationshipsFromCode(
  project: Project,
  allSchemas: ExtractedSchema[],
): Relationship[] {
  const codeRelationships: Relationship[] = [];
  const modelToCollectionMap = new Map<string, string>();
  const collectionToModelMap = new Map<string, string>();

  for (const s of allSchemas) {
    const colName = s.collectionName || getCollectionName(s.name);
    modelToCollectionMap.set(s.name, colName);
    collectionToModelMap.set(colName, s.name);
  }

  const findModelByCollection = (coll: string): string | undefined => {
    const cleaned = coll.replace(/['"]/g, "").trim();
    if (collectionToModelMap.has(cleaned)) {
      return collectionToModelMap.get(cleaned);
    }
    const lower = cleaned.toLowerCase();
    for (const [col, model] of collectionToModelMap.entries()) {
      if (col.toLowerCase() === lower) return model;
    }
    return undefined;
  };

  const sourceFiles = project.getSourceFiles();
  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    // Use the configured schema root so that only files under the correct directory are scanned.
    const schemaRoot = getSchemaRoot();
    const schemaRootNorm = schemaRoot.replace(/\\/g, "/");
    const fileNorm = filePath.replace(/\\/g, "/");
    if (!fileNorm.includes(schemaRootNorm)) continue;

    // Extract the module name as the first path segment under schemaRoot.
    const relPart = fileNorm
      .slice(fileNorm.indexOf(schemaRootNorm) + schemaRootNorm.length)
      .replace(/^\//, "");
    const moduleName = relPart.split("/")[0];
    if (!moduleName) continue;

    const nativeSchemas = allSchemas.filter((s) => s.moduleName === moduleName);
    if (nativeSchemas.length === 0) continue;
    const primaryModel = nativeSchemas[0].name;

    // Scan for .populate() calls
    const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of callExprs) {
      const expr = call.getExpression();
      const exprText = expr.getText();

      if (exprText.endsWith(".populate") || exprText === "populate") {
        const args = call.getArguments();
        if (args.length === 0) continue;

        let sourceModel = primaryModel;
        const chainText = exprText;
        for (const s of nativeSchemas) {
          if (chainText.startsWith(s.name + ".")) {
            sourceModel = s.name;
            break;
          }
        }

        const parsePopulateArg = (arg: Node) => {
          if (Node.isObjectLiteralExpression(arg)) {
            const pathProp = arg.getProperty("path");
            const modelProp = arg.getProperty("model");
            if (pathProp && modelProp) {
              const pathName = pathProp
                .getText()
                .replace(/['"]/g, "")
                .replace(/path:/, "")
                .trim();
              const targetModel = modelProp
                .getText()
                .replace(/['"]/g, "")
                .replace(/model:/, "")
                .trim();
              if (targetModel) {
                codeRelationships.push({
                  source: targetModel,
                  target: sourceModel,
                  type: "one-to-many",
                  label: `${pathName} (populate)`,
                });
              }
            }
          } else if (Node.isArrayLiteralExpression(arg)) {
            for (const el of arg.getElements()) {
              parsePopulateArg(el);
            }
          }
        };

        for (const arg of args) {
          parsePopulateArg(arg);
        }
      }
    }

    // Scan for $lookup objects
    const objLiterals = sf.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression,
    );
    for (const obj of objLiterals) {
      const lookupProp = obj.getProperty("$lookup");
      if (lookupProp && Node.isPropertyAssignment(lookupProp)) {
        const init = lookupProp.getInitializer();
        if (init && Node.isObjectLiteralExpression(init)) {
          const fromProp = init.getProperty("from");
          const localFieldProp = init.getProperty("localField");
          const asProp = init.getProperty("as");

          if (fromProp) {
            const fromVal = fromProp
              .getText()
              .replace(/['"]/g, "")
              .replace(/from:/, "")
              .trim();
            const localFieldVal = localFieldProp
              ? localFieldProp
                  .getText()
                  .replace(/['"]/g, "")
                  .replace(/localField:/, "")
                  .trim()
              : "";
            const asVal = asProp
              ? asProp.getText().replace(/['"]/g, "").replace(/as:/, "").trim()
              : "";

            const targetModel = findModelByCollection(fromVal);
            if (targetModel) {
              let sourceModel = primaryModel;
              const parentCall = obj.getFirstAncestorByKind(
                SyntaxKind.CallExpression,
              );
              if (parentCall) {
                const callText = parentCall.getExpression().getText();
                for (const s of nativeSchemas) {
                  if (callText.startsWith(s.name + ".")) {
                    sourceModel = s.name;
                    break;
                  }
                }
              }

              codeRelationships.push({
                source: targetModel,
                target: sourceModel,
                type: "one-to-many",
                label: `${asVal || localFieldVal} ($lookup)`,
              });
            }
          }
        }
      }
    }
  }

  return codeRelationships;
}

function validateDrawioXml(
  xmlContent: string,
  moduleName: string,
): string | null {
  try {
    const tags = ["mxfile", "diagram", "mxGraphModel", "root"];
    for (const tag of tags) {
      if (
        !xmlContent.includes(`<${tag}`) ||
        !xmlContent.includes(`</${tag}>`)
      ) {
        return `Missing XML tag: <${tag}> or </${tag}>`;
      }
    }

    const cellRegex =
      /<mxCell\s+id="([^"]+)"(?:[^>]*?parent="([^"]+)")?(?:[^>]*?source="([^"]+)")?(?:[^>]*?target="([^"]+)")?(?:[^>]*?edge="1")?/g;
    const cellIds = new Set<string>();
    const parentRefs = new Map<string, string>();
    const edges: {
      id: string;
      source: string;
      target: string;
      parent: string;
    }[] = [];

    let match;
    cellRegex.lastIndex = 0;
    while ((match = cellRegex.exec(xmlContent)) !== null) {
      const id = match[1];
      const parent = match[2];
      const source = match[3];
      const target = match[4];
      const isEdge = match[0].includes('edge="1"');

      if (cellIds.has(id)) {
        return `Duplicate cell ID detected: "${id}"`;
      }
      cellIds.add(id);

      if (parent) {
        parentRefs.set(id, parent);
      }

      if (isEdge) {
        if (!source || !target) {
          return `Edge cell "${id}" is missing source or target attribute`;
        }
        edges.push({ id, source, target, parent: parent || "1" });
      }
    }

    // Check parent hierarchy
    for (const [id, parent] of parentRefs.entries()) {
      if (id === "0" || id === "1") continue;
      if (!cellIds.has(parent)) {
        return `Cell "${id}" references a parent ID "${parent}" which does not exist`;
      }
    }

    // Check edge source and target exist
    for (const edge of edges) {
      if (!cellIds.has(edge.source)) {
        return `Edge "${edge.id}" references a source ID "${edge.source}" which does not exist (Orphan connector)`;
      }
      if (!cellIds.has(edge.target)) {
        return `Edge "${edge.id}" references a target ID "${edge.target}" which does not exist (Orphan connector)`;
      }
    }

    return null;
  } catch (err: any) {
    return `XML parsing exception: ${err.message}`;
  }
}

function safeWriteDrawioFile(filePath: string, xmlContent: string) {
  // ERD_KEEP_EXISTING=1 restores the old skip-if-exists behaviour for people who hand-edit diagrams.
  if (process.env.ERD_KEEP_EXISTING === "1" && fs.existsSync(filePath)) {
    console.log(`[ERD_KEEP_EXISTING] Skipping (file exists): ${filePath}`);
    return;
  }
  // Write atomically: temp file then rename so a crash never leaves a partial file.
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, xmlContent, "utf8");
  fs.renameSync(tmpPath, filePath);
}

// ----------------------------------------------------
// WHOLE ER DIAGRAM CONFIGURATION & LAYOUT ENGINE
// ----------------------------------------------------
export interface CanonicalRelationship {
  source: string; // referenced entity (or parent)
  target: string; // referencing entity (or child)
  fkEnt: string;
  refEnt: string;
  fieldPath: string;
  type: "one-to-one" | "one-to-many";
  kind:
    | "single ref"
    | "array of refs"
    | "embedded path (dotted field)"
    | "one-to-one (unique)";
  isParentChild?: boolean;
}

export const WHOLE_ERD_CONFIG = {
  // Hub entity threshold: ERD_HUB_MIN_REFS overrides the adaptive rule when set.
  // When not set, an adaptive outlier rule is used (see computeHubThreshold).
  hubMinReferences: process.env.ERD_HUB_MIN_REFS
    ? parseInt(process.env.ERD_HUB_MIN_REFS, 10)
    : 0, // 0 means "use adaptive rule"

  // Constant weight pulling hub modules toward referencing modules
  hubCentroidWeight: 0.25,

  // Grid dimensions are computed dynamically from module counts (see buildWholeDiagram).
  // These config values are generic layout constants, not project-specific data.
  // Target aspect ratio for the connected grid (width/height goal: 1.3 to 2.0 landscape)
  aspectRatioTarget: 1.6,
  gutterX: 65, // Horizontal corridor between module columns
  gutterY: 55, // Vertical corridor between module rows
  margin: 50, // Canvas margin around the entire grid

  // Entity sizing & styling inside module blocks
  entityWidth: 260,
  // Multi-column thresholds: use 3 sub-columns when entity count >= highThreshold, 2 when >= midThreshold
  multiColHighThreshold: 8, // entCols = 3
  multiColMidThreshold: 4, // entCols = 2
  subColumnGap: 24,
  entityVerticalGap: 24, // Guaranteed vertical clearance between stacked entities
  containerPaddingX: 20,
  containerPaddingTop: 44,
  containerPaddingBottom: 36,

  // Stubs configuration (only for non-hub long-range relationships)
  stubWidth: 135,
  stubHeight: 20,
  stubPillGap: 16,
  longEdgeThresholdDistance: 1, // Manhattan distance > 1 or obstructed path uses short horizontal stub

  // Placement optimization parameters
  localSearchIterations: 40000,
  prngSeed: 123456789,
};

/**
 * Adaptive hub threshold: hubs are entities whose in-degree is a clear outlier.
 *
 * Algorithm (documented):
 * 1. Sort all entities by in-degree descending.
 * 2. Find the largest absolute gap between consecutive counts where both counts >= minFloor.
 * 3. Entities with in-degree > (the lower value at the gap) are hubs.
 * 4. If no gap >= minGap found, fall back: hubs are entities with in-degree > mean + 1.5*stddev.
 * 5. ERD_HUB_MIN_REFS (WHOLE_ERD_CONFIG.hubMinReferences > 0) always overrides.
 *
 * With today's project data [40, 11, 7, 3, ...]: gaps are 29, 4, 4, ...
 * minGap=3, minFloor=4: largest gap >=3 where both sides >=4 is gap=4 (between 7 and 3).
 * Threshold = 3, so entities with indegree >= 4 are hubs. ✓ (example uses this project's current data)
 */
export function computeHubThreshold(
  incomingReferencingEntities: Map<string, Set<string>>,
): number {
  const manualOverride = WHOLE_ERD_CONFIG.hubMinReferences;
  if (manualOverride > 0) return manualOverride;

  const minFloor = 4; // entities with in-degree < this are never hubs
  const minGap = 3; // a gap of at least this size triggers the hub boundary

  const counts = Array.from(incomingReferencingEntities.values())
    .map((s) => s.size)
    .filter((c) => c >= minFloor)
    .sort((a, b) => b - a);

  if (counts.length === 0) return minFloor;

  // Find the largest gap where both sides are >= minFloor
  let bestGap = 0;
  let bestThreshold = minFloor - 1;
  for (let i = 0; i < counts.length - 1; i++) {
    const gap = counts[i] - counts[i + 1];
    if (gap >= minGap && counts[i + 1] >= minFloor && gap > bestGap) {
      bestGap = gap;
      // Entities with count > counts[i+1] are hubs; threshold = counts[i+1]
      bestThreshold = counts[i + 1];
    }
  }

  if (bestGap >= minGap) {
    // Include all entities at or above threshold (>= bestThreshold)
    return bestThreshold;
  }

  // Fallback: statistical outlier (mean + 1.5 * stddev) over all entities
  const allCounts = Array.from(incomingReferencingEntities.values()).map(
    (s) => s.size,
  );
  const mean = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
  const variance =
    allCounts.reduce((a, b) => a + (b - mean) ** 2, 0) / allCounts.length;
  const stddev = Math.sqrt(variance);
  return Math.max(minFloor, Math.round(mean + 1.5 * stddev));
}

function estimateWholeRowHeight(labelHtml: string, colWidth: number): number {
  const plainText = labelHtml.replace(/<[^>]+>/g, "");
  const usableWidth = colWidth - 16; // 8px spacing left/right
  // Font size is 10px in compact whole diagram. Average char width is ~5.4px.
  const charsPerLine = Math.floor(usableWidth / 5.4);
  const lines = Math.ceil(plainText.length / charsPerLine) || 1;
  return lines > 1 ? 26 + (lines - 1) * 14 : 24;
}

function generateHubReferencesDoc(
  hubEntities: Set<string>,
  canonicalRels: CanonicalRelationship[],
  schemasToRender: Map<string, ExtractedSchema>,
  docPath: string,
) {
  let md = "# Hub Entity References\n\n";
  const projectName = path.basename(path.resolve(__dirname, ".."));
  md += `This document lists all entities and fields that reference hub entities across the ${projectName} codebase.\n\n`;

  for (const h of Array.from(hubEntities).sort()) {
    const list = canonicalRels
      .filter((r) => r.refEnt === h && !r.isParentChild && r.fkEnt !== h)
      .map((r) => ({
        module: schemasToRender.get(r.fkEnt)?.moduleName || "unknown",
        entity: r.fkEnt,
        field: r.fieldPath,
        kind: r.kind,
      }));

    list.sort(
      (a, b) =>
        a.module.localeCompare(b.module) ||
        a.entity.localeCompare(b.entity) ||
        a.field.localeCompare(b.field),
    );

    const distinctEnts = new Set(list.map((i) => i.entity)).size;
    md += `## Hub: \`${h}\` (${distinctEnts} referencing entities, ${list.length} reference fields)\n\n`;
    md += "| Module | Referencing Entity | Field Path | Kind |\n";
    md += "| :--- | :--- | :--- | :--- |\n";
    for (const item of list) {
      md += `| \`${item.module}\` | \`${item.entity}\` | \`${item.field}\` | ${item.kind} |\n`;
    }
    md += "\n";
  }

  fs.writeFileSync(docPath, md, "utf8");
  console.log(
    `Generated hub reference documentation at: docs/erd/hub-references.md`,
  );
}

export function buildWholeDiagram(
  nativeSchemas: ExtractedSchema[],
  allSchemasMap: Map<string, ExtractedSchema>,
  moduleMap: Map<string, string[]>,
  codeRelations: Relationship[] = [],
): string {
  const isCompact = process.env.ERD_WHOLE_MODE !== "full";
  const theme = getActiveTheme();

  // Disambiguate duplicate schema names across different modules (e.g. local sub-schemas like "auditLogSchema")
  const moduleSchemaKey = (moduleName: string, name: string) =>
    `${moduleName}::${name}`;
  const nameOccurrences = new Map<string, string[]>();
  for (const s of nativeSchemas) {
    if (!nameOccurrences.has(s.name)) nameOccurrences.set(s.name, []);
    nameOccurrences.get(s.name)!.push(s.moduleName);
  }

  const getEntityRenderName = (schema: ExtractedSchema) => {
    const mods = nameOccurrences.get(schema.name);
    if (mods && mods.length > 1) {
      return `${capitalize(schema.moduleName)}_${capitalize(schema.name)}`;
    }
    return schema.name;
  };

  const schemasToRender = new Map<string, ExtractedSchema>();
  const entityNameMap = new Map<string, string>(); // "moduleName::rawName" -> renderName

  for (const schema of nativeSchemas) {
    const renderName = getEntityRenderName(schema);
    entityNameMap.set(
      moduleSchemaKey(schema.moduleName, schema.name),
      renderName,
    );
    schemasToRender.set(renderName, {
      ...schema,
      name: renderName,
    });
  }

  // 1. Gather all schema fields and build canonical relationships
  const canonicalRels: CanonicalRelationship[] = [];
  const schemaFieldKeys = new Set<string>(); // "fkEnt|refEnt|fieldPath"

  for (const nativeSchema of nativeSchemas) {
    const currentEntityRenderName =
      entityNameMap.get(
        moduleSchemaKey(nativeSchema.moduleName, nativeSchema.name),
      ) || nativeSchema.name;

    const checkFields = (
      fields: ExtractedField[],
      parentEntity: string,
      prefix = "",
    ) => {
      for (const field of fields) {
        const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;

        if (field.ref) {
          const targetSchema = allSchemasMap.get(field.ref);
          if (targetSchema) {
            const targetRenderName =
              entityNameMap.get(
                moduleSchemaKey(targetSchema.moduleName, targetSchema.name),
              ) || targetSchema.name;
            const isUnique = field.unique && !field.type.endsWith("[]");
            const isArray = field.type.endsWith("[]");
            const isDotted = fieldPath.includes(".");
            const kind: CanonicalRelationship["kind"] = isUnique
              ? "one-to-one (unique)"
              : isArray
                ? "array of refs"
                : isDotted
                  ? "embedded path (dotted field)"
                  : "single ref";

            canonicalRels.push({
              source: targetRenderName,
              target: parentEntity,
              fkEnt: parentEntity,
              refEnt: targetRenderName,
              fieldPath,
              type: isUnique ? "one-to-one" : "one-to-many",
              kind,
            });
            schemaFieldKeys.add(
              `${parentEntity}|${targetRenderName}|${fieldPath}`,
            );
          }
        }

        if (field.refPath) {
          const pathField = findFieldByPath(nativeSchema.fields, field.refPath);
          if (pathField && pathField.enum && pathField.enum.length > 0) {
            for (const modelName of pathField.enum) {
              const targetSchema = allSchemasMap.get(modelName);
              if (targetSchema) {
                const targetRenderName =
                  entityNameMap.get(
                    moduleSchemaKey(targetSchema.moduleName, targetSchema.name),
                  ) || targetSchema.name;
                const isDotted = fieldPath.includes(".");
                canonicalRels.push({
                  source: targetRenderName,
                  target: parentEntity,
                  fkEnt: parentEntity,
                  refEnt: targetRenderName,
                  fieldPath,
                  type: "one-to-many",
                  kind: isDotted
                    ? "embedded path (dotted field)"
                    : "single ref",
                });
                schemaFieldKeys.add(
                  `${parentEntity}|${targetRenderName}|${fieldPath}`,
                );
              }
            }
          }
        }

        const cleanTypeVal = field.type.replace(/\[\]$/, "");
        const localTarget = nativeSchemas.find(
          (s) =>
            s.name === cleanTypeVal && s.moduleName === nativeSchema.moduleName,
        );
        const globalTarget = allSchemasMap.get(cleanTypeVal);
        const targetSchema = localTarget || globalTarget;

        if (targetSchema && cleanTypeVal !== parentEntity) {
          const isArray = field.type.endsWith("[]");
          const isLocalChild =
            targetSchema.moduleName === nativeSchema.moduleName;
          const targetRenderName =
            entityNameMap.get(
              moduleSchemaKey(targetSchema.moduleName, targetSchema.name),
            ) || targetSchema.name;

          canonicalRels.push({
            source: isLocalChild ? parentEntity : targetRenderName,
            target: isLocalChild ? targetRenderName : parentEntity,
            fkEnt: isLocalChild ? targetRenderName : parentEntity,
            refEnt: isLocalChild ? parentEntity : targetRenderName,
            fieldPath,
            type: isArray ? "one-to-many" : "one-to-one",
            kind: isArray ? "array of refs" : "single ref",
            isParentChild: isLocalChild,
          });
          schemaFieldKeys.add(
            `${parentEntity}|${targetRenderName}|${fieldPath}`,
          );
        }

        if (field.isNested && field.nestedFields) {
          if (field.type === "object[]") {
            const subEntityName = `${parentEntity}_${capitalize(field.name)}`;
            schemasToRender.set(subEntityName, {
              name: subEntityName,
              moduleName: nativeSchema.moduleName,
              filePath: nativeSchema.filePath,
              fields: field.nestedFields,
              plugins: [],
              indexes: [],
              virtuals: [],
              timestamps: false,
            });

            canonicalRels.push({
              source: parentEntity,
              target: subEntityName,
              fkEnt: subEntityName,
              refEnt: parentEntity,
              fieldPath: field.name,
              type: "one-to-many",
              kind: "array of refs",
              isParentChild: true,
            });

            checkFields(field.nestedFields, subEntityName, "");
          } else {
            checkFields(field.nestedFields, parentEntity, fieldPath);
          }
        }
      }
    };

    checkFields(nativeSchema.fields, currentEntityRenderName);

    for (const virt of nativeSchema.virtuals) {
      if (virt.ref && virt.localField && virt.foreignField) {
        const targetSchema = allSchemasMap.get(virt.ref);
        if (targetSchema) {
          const targetRenderName =
            entityNameMap.get(
              moduleSchemaKey(targetSchema.moduleName, targetSchema.name),
            ) || targetSchema.name;
          canonicalRels.push({
            source: currentEntityRenderName,
            target: targetRenderName,
            fkEnt: currentEntityRenderName,
            refEnt: targetRenderName,
            fieldPath: virt.localField || virt.name,
            type: virt.justOne ? "one-to-one" : "one-to-many",
            kind: virt.justOne ? "one-to-one (unique)" : "single ref",
          });
          schemaFieldKeys.add(
            `${currentEntityRenderName}|${targetRenderName}|${virt.localField || virt.name}`,
          );
        }
      }
    }
  }

  // 2. Add code relationships, deduplicating against schema fields and validating attribution
  for (const cr of codeRelations) {
    let refEnt = cr.source;
    let fkEnt = cr.target;
    let cleanLabel = cr.label.replace(/\s*\([^)]*\)/g, "").trim();

    const fkSchema = allSchemasMap.get(fkEnt);
    const refSchema = allSchemasMap.get(refEnt);
    if (!fkSchema || !refSchema) continue;

    const fkRenderName =
      entityNameMap.get(moduleSchemaKey(fkSchema.moduleName, fkSchema.name)) ||
      fkSchema.name;
    const refRenderName =
      entityNameMap.get(
        moduleSchemaKey(refSchema.moduleName, refSchema.name),
      ) || refSchema.name;

    // Validate that fkEnt actually contains a real schema field referencing refEnt or matching cleanLabel
    const matchingField = fkSchema.fields.find(
      (f) =>
        f.ref === refEnt ||
        f.name === cleanLabel ||
        f.name === `${cleanLabel}Id` ||
        (f.ref && f.name.toLowerCase().includes(cleanLabel.toLowerCase())),
    );
    if (!matchingField) {
      // Discard ungrounded / falsely attributed code relations
      continue;
    }

    // Always use the real schema field name (e.g. resolves "categoryDetails ($lookup)" -> "itemCategory")
    const schemaFieldName = matchingField.name;
    const key = `${fkRenderName}|${refRenderName}|${schemaFieldName}`;
    if (schemaFieldKeys.has(key)) continue;

    canonicalRels.push({
      source: refRenderName,
      target: fkRenderName,
      fkEnt: fkRenderName,
      refEnt: refRenderName,
      fieldPath: schemaFieldName,
      type: cr.type,
      kind: "single ref",
    });
    schemaFieldKeys.add(key);
  }

  // Compute incoming distinct referencing entities for Hub determination
  // (Excluding parent-to-own-child links and self-references)
  const incomingReferencingEntities = new Map<string, Set<string>>();
  for (const entName of schemasToRender.keys()) {
    incomingReferencingEntities.set(entName, new Set<string>());
  }

  for (const rel of canonicalRels) {
    if (rel.isParentChild) continue;
    if (rel.fkEnt === rel.refEnt) continue;
    if (incomingReferencingEntities.has(rel.refEnt)) {
      incomingReferencingEntities.get(rel.refEnt)!.add(rel.fkEnt);
    }
  }

  // Identify Hub Entities using adaptive threshold (or ERD_HUB_MIN_REFS override)
  const hubThreshold = computeHubThreshold(incomingReferencingEntities);
  const hubEntities = new Set<string>();
  for (const [entName, refs] of incomingReferencingEntities.entries()) {
    if (refs.size >= hubThreshold) {
      hubEntities.add(entName);
    }
  }

  const hubRuleDesc =
    WHOLE_ERD_CONFIG.hubMinReferences > 0
      ? `ERD_HUB_MIN_REFS=${WHOLE_ERD_CONFIG.hubMinReferences}`
      : `adaptive (largest-gap >= 3 above floor=4, or mean+1.5σ; threshold=${hubThreshold})`;
  console.log(`\n[Whole ERD] Hub detection rule: ${hubRuleDesc}`);
  console.log(
    `[Whole ERD] Discovered ${hubEntities.size} Hub Entities (in-degree >= ${hubThreshold}):`,
  );
  for (const h of Array.from(hubEntities).sort()) {
    console.log(
      `  - ${h}: referenced by ${incomingReferencingEntities.get(h)!.size} distinct entities`,
    );
  }

  // Print top 15 entities by distinct referencing entities
  const sortedByRefs = Array.from(incomingReferencingEntities.entries())
    .map(([ent, refs]) => ({
      name: ent,
      module: schemasToRender.get(ent)?.moduleName || "unknown",
      count: refs.size,
    }))
    .sort((a, b) => b.count - a.count);

  console.log("\n=== TOP 15 ENTITIES BY DISTINCT REFERENCING ENTITIES ===");
  for (let i = 0; i < Math.min(15, sortedByRefs.length); i++) {
    const item = sortedByRefs[i];
    console.log(
      `  ${(i + 1).toString().padStart(2)}. ${item.name.padEnd(25)} (module: ${item.module.padEnd(18)}) : ${item.count} references`,
    );
  }

  // Generate hub reference documentation docs/erd/hub-references.md
  const hubDocPath = path.resolve(__dirname, "../docs/erd/hub-references.md");
  generateHubReferencesDoc(
    hubEntities,
    canonicalRels,
    schemasToRender,
    hubDocPath,
  );

  // Map each entity's FK fields that point to a Hub entity, Self-reference, or Embedded child
  const hubFkFieldMap = new Map<string, string>();
  const selfFkFieldMap = new Map<string, string>();
  const embeddedFkFieldMap = new Map<string, string>();
  const childParentMap = new Map<string, string>();

  for (const rel of canonicalRels) {
    const cleanField = rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_");
    const dotParts = rel.fieldPath.split(".");

    if (rel.isParentChild) {
      embeddedFkFieldMap.set(`${rel.refEnt}|${cleanField}`, rel.fkEnt);
      if (dotParts.length > 1) {
        embeddedFkFieldMap.set(
          `${rel.refEnt}|${dotParts.join("_")}`,
          rel.fkEnt,
        );
      }
      childParentMap.set(rel.fkEnt, rel.refEnt);
      continue;
    }

    if (rel.fkEnt === rel.refEnt) {
      selfFkFieldMap.set(`${rel.fkEnt}|${cleanField}`, rel.refEnt);
      if (dotParts.length > 1) {
        selfFkFieldMap.set(`${rel.fkEnt}|${dotParts.join("_")}`, rel.refEnt);
      }
      continue;
    }

    if (hubEntities.has(rel.refEnt)) {
      hubFkFieldMap.set(`${rel.fkEnt}|${cleanField}`, rel.refEnt);
      if (dotParts.length > 1) {
        hubFkFieldMap.set(`${rel.fkEnt}|${dotParts.join("_")}`, rel.refEnt);
      }
    }
  }

  // Build field labels and calculate exact dimensions for each entity
  const colWidth = WHOLE_ERD_CONFIG.entityWidth;
  const schemaInfos = new Map<
    string,
    {
      labels: FieldLabelInfo[];
      heights: number[];
      totalHeight: number;
      rowYOffsets: Map<string, number>;
    }
  >();
  const definedCellIds = new Set<string>();

  for (const [entName, schema] of schemasToRender.entries()) {
    const rawLabels = getFieldLabels(schema, entName);

    const augmentRow = (l: FieldLabelInfo): FieldLabelInfo => {
      const fieldIdPrefix = `field_${entName}_`;
      const cleanField = l.id.startsWith(fieldIdPrefix)
        ? l.id.slice(fieldIdPrefix.length)
        : "";

      const hubTarget =
        hubFkFieldMap.get(`${entName}|${cleanField}`) ||
        hubFkFieldMap.get(`${entName}|${cleanField.replace(/_/g, ".")}`) ||
        Array.from(hubFkFieldMap.entries()).find(
          ([k]) =>
            k.startsWith(`${entName}|`) && cleanField.endsWith(k.split("|")[1]),
        )?.[1];

      const selfTarget =
        selfFkFieldMap.get(`${entName}|${cleanField}`) ||
        selfFkFieldMap.get(`${entName}|${cleanField.replace(/_/g, ".")}`) ||
        Array.from(selfFkFieldMap.entries()).find(
          ([k]) =>
            k.startsWith(`${entName}|`) && cleanField.endsWith(k.split("|")[1]),
        )?.[1];

      const embeddedTarget =
        embeddedFkFieldMap.get(`${entName}|${cleanField}`) ||
        embeddedFkFieldMap.get(`${entName}|${cleanField.replace(/_/g, ".")}`) ||
        Array.from(embeddedFkFieldMap.entries()).find(
          ([k]) =>
            k.startsWith(`${entName}|`) && cleanField.endsWith(k.split("|")[1]),
        )?.[1];

      const targetToDisplay = hubTarget || selfTarget || embeddedTarget;

      if (targetToDisplay) {
        // Generic abbreviation: strip common suffixes and truncate to keep labels compact.
        function abbreviateEntityName(name: string): string {
          const noSuffix = name
            .replace(/Schema$/, "")
            .replace(/Configuration$/, "Config")
            .replace(/Management$/, "Mgmt")
            .replace(/Category$/, "Cat")
            .replace(/Information$/, "Info");
          return noSuffix.length > 12 ? noSuffix.slice(0, 10) + "…" : noSuffix;
        }
        const displayTarget = isCompact
          ? abbreviateEntityName(targetToDisplay)
          : targetToDisplay;
        const inlineArrow = ` <span style="color:${theme.relationships.foreignKey}; font-weight:600; font-size:10px;">&rarr; ${displayTarget}</span>`;

        let newHtml = l.labelHtml;
        if (isCompact) {
          // Omit redundant IDX badge on compact FK row with inline target to prevent text clipping
          newHtml = newHtml.replace(
            /<span style="background-color:[^"]*">IDX<\/span>/g,
            "",
          );
        }
        const commentIdx = newHtml.indexOf(
          '<span style="color:' +
            theme.rows.mutedText +
            '; font-size:10px; font-style:italic;">',
        );
        if (commentIdx !== -1) {
          newHtml =
            newHtml.slice(0, commentIdx) +
            inlineArrow +
            " " +
            newHtml.slice(commentIdx);
        } else {
          newHtml += inlineArrow;
        }

        return {
          ...l,
          labelHtml: newHtml,
          isFk: true,
        };
      }
      return l;
    };

    let labels: FieldLabelInfo[] = [];
    if (isCompact) {
      const badged = rawLabels
        .filter((l) => {
          return (
            l.isPk ||
            l.isFk ||
            l.labelHtml.includes(">PK</span>") ||
            l.labelHtml.includes(">FK</span>") ||
            l.labelHtml.includes(">UK</span>") ||
            l.labelHtml.includes(">IDX</span>") ||
            l.labelHtml.includes(">ENUM</span>")
          );
        })
        .map((l) => {
          const cleanHtml = l.labelHtml.replace(
            /<span style="color:[^"]*font-style:italic[^"]*">\([^)]*\)<\/span>/g,
            "",
          );
          return augmentRow({
            ...l,
            labelHtml: cleanHtml,
          });
        });

      const skippedCount = rawLabels.length - badged.length;
      labels = badged;
      if (skippedCount > 0) {
        labels.push({
          id: `field_${entName}__more`,
          labelHtml: `<span style="color:${theme.rows.mutedText}; font-style:italic;">+ ${skippedCount} more fields</span>`,
          isPk: false,
          isFk: false,
        });
      }
    } else {
      labels = rawLabels.map((l) => augmentRow(l));
    }

    // Add muted last row on each hub entity: "referenced by N entities"
    if (hubEntities.has(entName)) {
      const refCount = incomingReferencingEntities.get(entName)!.size;
      labels.push({
        id: `field_${entName}__hub_refs`,
        labelHtml: `<span style="color:${theme.rows.mutedText}; font-style:italic; font-size:10px;">referenced by ${refCount} entities</span>`,
        isPk: false,
        isFk: false,
      });
    }

    definedCellIds.add(`table_${entName}`);
    for (const l of labels) {
      definedCellIds.add(l.id);
    }

    const heights = labels.map((l) =>
      estimateWholeRowHeight(l.labelHtml, colWidth),
    );
    const rowYOffsets = new Map<string, number>();
    const headerStartSize = childParentMap.has(entName) ? 46 : 38;
    let currentY = headerStartSize;
    for (let i = 0; i < labels.length; i++) {
      rowYOffsets.set(labels[i].id, currentY);
      currentY += heights[i];
    }
    const totalHeight = currentY;

    schemaInfos.set(entName, {
      labels,
      heights,
      totalHeight,
      rowYOffsets,
    });
  }

  // Group entities by module
  const modEntities = new Map<string, string[]>();
  for (const [entName, schema] of schemasToRender.entries()) {
    const mod = schema.moduleName;
    if (!modEntities.has(mod)) modEntities.set(mod, []);
    modEntities.get(mod)!.push(entName);
  }

  // Categorize relationships
  interface CategorizedRel {
    rel: CanonicalRelationship;
    sMod: string;
    tMod: string;
    fkEnt: string;
    refEnt: string;
  }

  const sameModRelations: CategorizedRel[] = [];
  const nonHubCrossRelations: CategorizedRel[] = [];
  let inlineHubCount = 0;
  let selfRefCount = 0;

  for (const rel of canonicalRels) {
    if (rel.fkEnt === rel.refEnt) {
      selfRefCount++;
      continue;
    }

    if (hubEntities.has(rel.refEnt)) {
      inlineHubCount++;
      continue;
    }

    const sMod = schemasToRender.get(rel.fkEnt)?.moduleName || "unknown";
    const tMod = schemasToRender.get(rel.refEnt)?.moduleName || "unknown";

    if (rel.isParentChild) {
      // Embedded child schemas handled via table header subtitle & parent row inline target
      continue;
    }

    if (sMod === tMod) {
      sameModRelations.push({
        rel,
        sMod,
        tMod,
        fkEnt: rel.fkEnt,
        refEnt: rel.refEnt,
      });
    } else {
      nonHubCrossRelations.push({
        rel,
        sMod,
        tMod,
        fkEnt: rel.fkEnt,
        refEnt: rel.refEnt,
      });
    }
  }

  // Partition modules into Connected vs Standalone
  const connectedModsSet = new Set<string>();
  for (const item of nonHubCrossRelations) {
    connectedModsSet.add(item.sMod);
    connectedModsSet.add(item.tMod);
  }
  for (const h of hubEntities) {
    const m = schemasToRender.get(h)?.moduleName;
    if (m) connectedModsSet.add(m);
  }

  const allActiveMods = Array.from(modEntities.keys()).sort();
  const standaloneMods = allActiveMods
    .filter((m) => !connectedModsSet.has(m))
    .sort();
  const connectedMods = Array.from(connectedModsSet).sort();

  console.log(
    `[Whole ERD] Partitioned modules: ${connectedMods.length} Connected, ${standaloneMods.length} Standalone.`,
  );

  // Pre-calculate module block dimensions and internal entity coordinates
  interface ModuleBlockLayout {
    modName: string;
    width: number;
    height: number;
    entityPositions: Map<string, { rx: number; ry: number }>;
    stubPositions: Map<
      string,
      { rx: number; ry: number; w: number; h: number }
    >;
    entCols: number;
  }

  const moduleLayouts = new Map<string, ModuleBlockLayout>();

  for (const modName of allActiveMods) {
    const ents = modEntities.get(modName)!;

    let entCols = 1;
    if (ents.length >= WHOLE_ERD_CONFIG.multiColHighThreshold) {
      entCols = 3;
    } else if (ents.length >= WHOLE_ERD_CONFIG.multiColMidThreshold) {
      entCols = 2;
    }

    const entityPositions = new Map<string, { rx: number; ry: number }>();
    const colHeights = new Array(entCols).fill(0);

    const sortedEnts = [...ents].sort((a, b) => {
      const primary = capitalize(modName);
      if (a === primary) return -1;
      if (b === primary) return 1;
      return 0;
    });

    for (const e of sortedEnts) {
      const h = schemaInfos.get(e)?.totalHeight || 200;
      let minCol = 0;
      for (let c = 1; c < entCols; c++) {
        if (colHeights[c] < colHeights[minCol]) minCol = c;
      }
      const ex =
        WHOLE_ERD_CONFIG.containerPaddingX +
        minCol * (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap);
      const ey = WHOLE_ERD_CONFIG.containerPaddingTop + colHeights[minCol];
      entityPositions.set(e, { rx: ex, ry: ey });
      colHeights[minCol] += h + WHOLE_ERD_CONFIG.entityVerticalGap;
    }

    const entityAreaWidth =
      entCols * WHOLE_ERD_CONFIG.entityWidth +
      (entCols - 1) * WHOLE_ERD_CONFIG.subColumnGap;
    const maxEntHeight = Math.max(...colHeights);

    const baseWidth = WHOLE_ERD_CONFIG.containerPaddingX * 2 + entityAreaWidth;
    const baseHeight = maxEntHeight + WHOLE_ERD_CONFIG.containerPaddingBottom;

    moduleLayouts.set(modName, {
      modName,
      width: baseWidth,
      height: baseHeight,
      entityPositions,
      stubPositions: new Map(),
      entCols,
    });
  }

  // Compute grid dimensions from actual module layouts targeting 1.3 to 2.0 landscape aspect ratio
  const connectedCount = connectedMods.length;
  const standaloneCount = standaloneMods.length;
  const CONNECTED_CELLS_NEEDED = connectedCount + 1; // +1 for legend

  const avgConnW =
    connectedMods.reduce(
      (s, m) => s + (moduleLayouts.get(m)?.width || 340),
      0,
    ) / Math.max(1, connectedCount);
  const avgConnH =
    connectedMods.reduce(
      (s, m) => s + (moduleLayouts.get(m)?.height || 260),
      0,
    ) / Math.max(1, connectedCount);
  const avgStandW =
    standaloneMods.reduce(
      (s, m) => s + (moduleLayouts.get(m)?.width || 340),
      0,
    ) / Math.max(1, standaloneCount);
  const avgStandH =
    standaloneMods.reduce(
      (s, m) => s + (moduleLayouts.get(m)?.height || 260),
      0,
    ) / Math.max(1, standaloneCount);

  interface GridCandidate {
    c: number;
    r: number;
    cells: number;
    occupancy: number;
    standCols: number;
    standRows: number;
    aspect: number;
  }

  const gridCandidates: GridCandidate[] = [];
  const minC = Math.ceil(Math.sqrt(CONNECTED_CELLS_NEEDED));
  const maxC = Math.min(16, CONNECTED_CELLS_NEEDED);

  for (let c = minC; c <= maxC; c++) {
    const r = Math.ceil(CONNECTED_CELLS_NEEDED / c);
    const cells = c * r;
    const occupancy = CONNECTED_CELLS_NEEDED / cells;

    const estWidth =
      c * avgConnW +
      (c - 1) * WHOLE_ERD_CONFIG.gutterX +
      2 * WHOLE_ERD_CONFIG.margin;
    const standCols = c;
    const standRows =
      standaloneCount > 0 ? Math.ceil(standaloneCount / standCols) : 0;
    const estStandH =
      standRows > 0
        ? standRows * avgStandH +
          (standRows - 1) * WHOLE_ERD_CONFIG.gutterY +
          60
        : 0;
    const estHeight =
      r * avgConnH +
      (r - 1) * WHOLE_ERD_CONFIG.gutterY +
      (estStandH > 0 ? estStandH + WHOLE_ERD_CONFIG.gutterY : 0) +
      2 * WHOLE_ERD_CONFIG.margin;
    const aspect = estWidth / estHeight;

    gridCandidates.push({
      c,
      r,
      cells,
      occupancy,
      standCols,
      standRows,
      aspect,
    });
  }

  // Filter for landscape aspect ratio range [1.3, 2.0]
  const validGridCandidates = gridCandidates.filter(
    (cd) => cd.aspect >= 1.3 && cd.aspect <= 2.0,
  );

  let bestGrid: GridCandidate;
  if (validGridCandidates.length > 0) {
    validGridCandidates.sort((a, b) => {
      const occDiff = b.occupancy - a.occupancy;
      if (Math.abs(occDiff) > 0.05) return occDiff;
      return Math.abs(a.aspect - 1.55) - Math.abs(b.aspect - 1.55);
    });
    bestGrid = validGridCandidates[0];
  } else {
    gridCandidates.sort(
      (a, b) => Math.abs(a.aspect - 1.55) - Math.abs(b.aspect - 1.55),
    );
    bestGrid = gridCandidates[0];
  }

  const COLS = bestGrid.c;
  const CONNECTED_ROWS = bestGrid.r;
  const CONNECTED_CELLS = CONNECTED_ROWS * COLS;
  const STANDALONE_COLS = bestGrid.standCols;
  const STANDALONE_ROWS = bestGrid.standRows;
  const STANDALONE_CELLS = STANDALONE_ROWS * STANDALONE_COLS;

  const prevCols = Math.max(
    1,
    Math.round(Math.sqrt(CONNECTED_CELLS_NEEDED * 1.6)),
  );
  const prevRows = Math.ceil(CONNECTED_CELLS_NEEDED / prevCols);
  const prevOccupancy = CONNECTED_CELLS_NEEDED / (prevCols * prevRows);

  console.log(
    `[Whole ERD] Dynamic Grid Optimization: before=${prevCols}x${prevRows} (occupancy: ${(prevOccupancy * 100).toFixed(1)}%, portrait ~0.85) -> after=${COLS}x${CONNECTED_ROWS} (occupancy: ${(bestGrid.occupancy * 100).toFixed(1)}%, aspect: ${bestGrid.aspect.toFixed(2)} in [1.3, 2.0] landscape)`,
  );
  console.log(
    `[Whole ERD] Grid: connected ${COLS}×${CONNECTED_ROWS} (${CONNECTED_CELLS_NEEDED - 1} mods + 1 legend), standalone ${STANDALONE_COLS}×${STANDALONE_ROWS} (${standaloneCount} mods)`,
  );

  const assignment: (string | null)[] = new Array(CONNECTED_CELLS).fill(null);
  const standaloneAssignment: (string | null)[] = new Array(
    Math.max(1, STANDALONE_CELLS),
  ).fill(null);
  const modToCell = new Map<
    string,
    { r: number; c: number; cellId: number; isStandalone: boolean }
  >();

  // 1. Place Standalone modules in dense grid (sorted A-Z)
  for (let i = 0; i < standaloneMods.length; i++) {
    const mod = standaloneMods[i];
    const r = Math.floor(i / STANDALONE_COLS);
    const c = i % STANDALONE_COLS;
    standaloneAssignment[i] = mod;
    modToCell.set(mod, { r, c, cellId: i, isStandalone: true });
  }

  // Pre-calculate incoming hub references per connected module for centroid attraction
  const hubModRefs = new Map<string, Map<string, number>>();
  for (const h of hubEntities) {
    const hMod = schemasToRender.get(h)!.moduleName;
    hubModRefs.set(hMod, new Map());
  }

  for (const rel of canonicalRels) {
    if (rel.isParentChild || rel.fkEnt === rel.refEnt) continue;
    if (hubEntities.has(rel.refEnt)) {
      const hMod = schemasToRender.get(rel.refEnt)!.moduleName;
      const refMod = schemasToRender.get(rel.fkEnt)!.moduleName;
      if (refMod !== hMod && connectedModsSet.has(refMod)) {
        const cur = hubModRefs.get(hMod)!.get(refMod) || 0;
        hubModRefs.get(hMod)!.set(refMod, cur + 1);
      }
    }
  }

  // Data-driven priority pairs: boost the top-weighted module pairs by their raw relationship count.
  const crossWeights = new Map<string, number>();
  for (const item of nonHubCrossRelations) {
    const pair =
      item.sMod < item.tMod
        ? `${item.sMod}|${item.tMod}`
        : `${item.tMod}|${item.sMod}`;
    crossWeights.set(pair, (crossWeights.get(pair) || 0) + 1);
  }
  const TOP_PAIR_BOOST = 4;
  const TOP_PAIR_COUNT = Math.min(10, Math.ceil(crossWeights.size * 0.3));
  const sortedPairs = Array.from(crossWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PAIR_COUNT);
  for (const [pair, w] of sortedPairs) {
    crossWeights.set(pair, w * TOP_PAIR_BOOST);
  }

  // Initial placement of connected modules
  let availCell = 0;
  for (const m of connectedMods) {
    const r = Math.floor(availCell / COLS);
    const c = availCell % COLS;
    assignment[availCell] = m;
    modToCell.set(m, { r, c, cellId: availCell, isStandalone: false });
    availCell++;
  }

  const computeCost = () => {
    let cost = 0;
    // 1. Cross-module edge distances + priority pairs
    for (const [pairKey, weight] of crossWeights.entries()) {
      const [m1, m2] = pairKey.split("|");
      const p1 = modToCell.get(m1);
      const p2 = modToCell.get(m2);
      if (p1 && p2) {
        cost += weight * (Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c));
      }
    }

    // 2. Hub centroid attraction
    for (const [hMod, refMap] of hubModRefs.entries()) {
      const hPos = modToCell.get(hMod);
      if (!hPos) continue;
      for (const [refMod, count] of refMap.entries()) {
        const rPos = modToCell.get(refMod);
        if (rPos) {
          cost +=
            WHOLE_ERD_CONFIG.hubCentroidWeight *
            count *
            (Math.abs(hPos.r - rPos.r) + Math.abs(hPos.c - rPos.c));
        }
      }
    }

    return cost;
  };

  let currentCost = computeCost();
  let seed = WHOLE_ERD_CONFIG.prngSeed;
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let iter = 0; iter < WHOLE_ERD_CONFIG.localSearchIterations; iter++) {
    const idx1 = Math.floor(lcg() * CONNECTED_CELLS);
    const idx2 = Math.floor(lcg() * CONNECTED_CELLS);
    if (idx1 === idx2) continue;

    const m1 = assignment[idx1];
    const m2 = assignment[idx2];
    if (!m1 && !m2) continue;

    assignment[idx1] = m2;
    assignment[idx2] = m1;
    const r1 = Math.floor(idx1 / COLS);
    const c1 = idx1 % COLS;
    const r2 = Math.floor(idx2 / COLS);
    const c2 = idx2 % COLS;
    if (m1)
      modToCell.set(m1, { r: r2, c: c2, cellId: idx2, isStandalone: false });
    if (m2)
      modToCell.set(m2, { r: r1, c: c1, cellId: idx1, isStandalone: false });

    const newCost = computeCost();
    if (newCost < currentCost) {
      currentCost = newCost;
    } else {
      assignment[idx1] = m1;
      assignment[idx2] = m2;
      if (m1)
        modToCell.set(m1, { r: r1, c: c1, cellId: idx1, isStandalone: false });
      if (m2)
        modToCell.set(m2, { r: r2, c: c2, cellId: idx2, isStandalone: false });
    }
  }

  // Collect stubs and neighbor edges
  interface MergedStub {
    id: string;
    fkEnt: string;
    refEnt: string;
    refMod: string;
    fkRowId: string;
    count: number;
    color: string;
    isBelow?: boolean;
  }

  const entityMergedStubs = new Map<string, MergedStub[]>();
  const neighborRelations: {
    rel: CanonicalRelationship;
    sourceCellId: string;
    targetCellId: string;
    color: string;
    sourceMod: string;
    targetMod: string;
    sourceEnt: string;
    targetEnt: string;
  }[] = [];

  let stubCounter = 1;

  const isExteriorFacing = (
    ent: string,
    mod: string,
    dir: "left" | "right" | "top" | "bottom",
  ): boolean => {
    const layout = moduleLayouts.get(mod);
    if (!layout) return false;
    const pos = layout.entityPositions.get(ent);
    if (!pos) return false;
    const col = Math.round(
      (pos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
        (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
    );

    if (dir === "left") return col === 0;
    if (dir === "right") return col === layout.entCols - 1;
    if (dir === "top") {
      for (const [otherEnt, otherPos] of layout.entityPositions.entries()) {
        if (otherEnt === ent) continue;
        const otherCol = Math.round(
          (otherPos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
            (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
        );
        if (otherCol === col && otherPos.ry < pos.ry) return false;
      }
      return true;
    }
    if (dir === "bottom") {
      for (const [otherEnt, otherPos] of layout.entityPositions.entries()) {
        if (otherEnt === ent) continue;
        const otherCol = Math.round(
          (otherPos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
            (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
        );
        if (otherCol === col && otherPos.ry > pos.ry) return false;
      }
      return true;
    }
    return false;
  };

  for (const item of nonHubCrossRelations) {
    const refEnt = item.rel.refEnt;
    const fkEnt = item.rel.fkEnt;
    const refMod = schemasToRender.get(refEnt)?.moduleName || "unknown";
    const fkMod = schemasToRender.get(fkEnt)?.moduleName || "unknown";
    const posRef = modToCell.get(refMod);
    const posFk = modToCell.get(fkMod);
    const dist =
      posRef && posFk
        ? Math.abs(posRef.r - posFk.r) + Math.abs(posRef.c - posFk.c)
        : 999;

    let relColor = theme.relationships.foreignKey;
    if (
      item.rel.fieldPath.includes("$lookup") ||
      item.rel.fieldPath.includes("virtual") ||
      item.rel.fieldPath.includes("refPath")
    ) {
      relColor = theme.relationships.embeddedOrLookup;
    } else {
      relColor = theme.relationships.interModule;
    }

    const isAdjacent = dist === 1;
    let canConnectDirectly = false;

    if (isAdjacent && posRef && posFk) {
      if (posRef.r === posFk.r) {
        if (posFk.c > posRef.c) {
          canConnectDirectly =
            isExteriorFacing(refEnt, refMod, "right") &&
            isExteriorFacing(fkEnt, fkMod, "left");
        } else {
          canConnectDirectly =
            isExteriorFacing(refEnt, refMod, "left") &&
            isExteriorFacing(fkEnt, fkMod, "right");
        }
      } else if (posRef.c === posFk.c) {
        if (posFk.r > posRef.r) {
          canConnectDirectly =
            isExteriorFacing(refEnt, refMod, "bottom") &&
            isExteriorFacing(fkEnt, fkMod, "top");
        } else {
          canConnectDirectly =
            isExteriorFacing(refEnt, refMod, "top") &&
            isExteriorFacing(fkEnt, fkMod, "bottom");
        }
      }
    }

    if (canConnectDirectly) {
      const cleanField = item.rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_");
      let sourceCellId = `field_${refEnt}__id`;
      if (!definedCellIds.has(sourceCellId)) {
        sourceCellId = `table_${refEnt}`;
      }
      let targetCellId = `field_${fkEnt}_${cleanField}`;
      if (!definedCellIds.has(targetCellId)) {
        targetCellId = `table_${fkEnt}`;
      }

      neighborRelations.push({
        rel: item.rel,
        sourceCellId,
        targetCellId,
        color: relColor,
        sourceMod: refMod,
        targetMod: fkMod,
        sourceEnt: refEnt,
        targetEnt: fkEnt,
      });
    } else {
      const cleanField = item.rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_");
      let fkRowId = `field_${fkEnt}_${cleanField}`;
      if (!definedCellIds.has(fkRowId)) {
        const match = Array.from(definedCellIds).find(
          (id) =>
            id.startsWith(`field_${fkEnt}_`) &&
            (id.endsWith(`_${cleanField}`) || id.includes(cleanField)),
        );
        fkRowId = match || `table_${fkEnt}`;
      }

      if (!entityMergedStubs.has(fkEnt)) {
        entityMergedStubs.set(fkEnt, []);
      }
      entityMergedStubs.get(fkEnt)!.push({
        id: `stub_out_${stubCounter++}`,
        fkEnt,
        refEnt,
        refMod,
        fkRowId,
        count: 1,
        color: relColor,
      });
    }
  }

  // Update module layout bounds to accommodate stub pills on the right margin
  for (const modName of allActiveMods) {
    const layout = moduleLayouts.get(modName)!;
    const ents = modEntities.get(modName)!;

    const modStubs: MergedStub[] = [];
    for (const e of ents) {
      if (entityMergedStubs.has(e)) {
        modStubs.push(...entityMergedStubs.get(e)!);
      }
    }

    const hasStubs = modStubs.length > 0;
    const stubWidth = WHOLE_ERD_CONFIG.stubWidth;
    const entityAreaWidth =
      layout.entCols * WHOLE_ERD_CONFIG.entityWidth +
      (layout.entCols - 1) * WHOLE_ERD_CONFIG.subColumnGap;

    let maxStubY = layout.height;
    const rightStubsByEnt = new Map<string, number>();
    const belowStubsByEnt = new Map<string, number>();

    for (const stub of modStubs) {
      const ePos = layout.entityPositions.get(stub.fkEnt);
      const eInfo = schemaInfos.get(stub.fkEnt);
      if (!ePos || !eInfo) continue;

      const entCol = Math.round(
        (ePos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
          (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
      );

      const isRightmostCol = entCol === layout.entCols - 1;

      let stubX: number;
      let targetY: number;

      if (isRightmostCol) {
        const rightIdx = rightStubsByEnt.get(stub.fkEnt) || 0;
        rightStubsByEnt.set(stub.fkEnt, rightIdx + 1);

        const rowYOffset = eInfo.rowYOffsets.get(stub.fkRowId) ?? 38;
        targetY =
          ePos.ry + rowYOffset + rightIdx * (WHOLE_ERD_CONFIG.stubHeight + 6);
        stubX =
          WHOLE_ERD_CONFIG.containerPaddingX +
          entityAreaWidth +
          WHOLE_ERD_CONFIG.stubPillGap;
      } else {
        stub.isBelow = true;
        const belowIdx = belowStubsByEnt.get(stub.fkEnt) || 0;
        belowStubsByEnt.set(stub.fkEnt, belowIdx + 1);

        stubX =
          ePos.rx + Math.round((WHOLE_ERD_CONFIG.entityWidth - stubWidth) / 2);
        targetY =
          ePos.ry +
          eInfo.totalHeight +
          14 +
          belowIdx * (WHOLE_ERD_CONFIG.stubHeight + 8);
      }

      layout.stubPositions.set(stub.id, {
        rx: stubX,
        ry: targetY,
        w: stubWidth,
        h: WHOLE_ERD_CONFIG.stubHeight,
      });
      maxStubY = Math.max(maxStubY, targetY + WHOLE_ERD_CONFIG.stubHeight + 14);
    }

    const stubAreaWidth = hasStubs
      ? stubWidth + WHOLE_ERD_CONFIG.stubPillGap
      : 0;
    layout.width =
      WHOLE_ERD_CONFIG.containerPaddingX * 2 + entityAreaWidth + stubAreaWidth;
    layout.height = Math.max(
      maxStubY + WHOLE_ERD_CONFIG.containerPaddingBottom,
      layout.height,
    );
  }

  // Compute Grid Coordinates
  // 1. Connected grid (Rows 0-2, 10 columns)
  const connColWidths = new Array(COLS).fill(
    WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.containerPaddingX * 2,
  );
  const connRowHeights = new Array(CONNECTED_ROWS).fill(180);

  for (let r = 0; r < CONNECTED_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const m = assignment[r * COLS + c];
      if (m && moduleLayouts.has(m)) {
        const layout = moduleLayouts.get(m)!;
        connColWidths[c] = Math.max(connColWidths[c], layout.width);
        connRowHeights[r] = Math.max(connRowHeights[r], layout.height);
      } else if (!m) {
        // Legend cell in connected grid
        connColWidths[c] = Math.max(connColWidths[c], 340);
        connRowHeights[r] = Math.max(connRowHeights[r], 270);
      }
    }
  }

  const connColX: number[] = [WHOLE_ERD_CONFIG.margin];
  for (let c = 1; c < COLS; c++) {
    connColX[c] =
      connColX[c - 1] + connColWidths[c - 1] + WHOLE_ERD_CONFIG.gutterX;
  }

  const connRowY: number[] = [WHOLE_ERD_CONFIG.margin];
  for (let r = 1; r < CONNECTED_ROWS; r++) {
    connRowY[r] =
      connRowY[r - 1] + connRowHeights[r - 1] + WHOLE_ERD_CONFIG.gutterY;
  }

  // 2. Standalone grid (Rows 3-4, 11 columns)
  const standColWidths = new Array(STANDALONE_COLS).fill(
    WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.containerPaddingX * 2,
  );
  const standRowHeights = new Array(STANDALONE_ROWS).fill(180);

  for (let r = 0; r < STANDALONE_ROWS; r++) {
    for (let c = 0; c < STANDALONE_COLS; c++) {
      const m = standaloneAssignment[r * STANDALONE_COLS + c];
      if (m && moduleLayouts.has(m)) {
        const layout = moduleLayouts.get(m)!;
        standColWidths[c] = Math.max(standColWidths[c], layout.width);
        standRowHeights[r] = Math.max(standRowHeights[r], layout.height);
      }
    }
  }

  const standColX: number[] = [WHOLE_ERD_CONFIG.margin];
  for (let c = 1; c < STANDALONE_COLS; c++) {
    standColX[c] =
      standColX[c - 1] + standColWidths[c - 1] + WHOLE_ERD_CONFIG.gutterX;
  }

  const standStartY =
    connRowY[CONNECTED_ROWS - 1] +
    connRowHeights[CONNECTED_ROWS - 1] +
    WHOLE_ERD_CONFIG.gutterY +
    40;
  const standRowY: number[] = [standStartY];
  for (let r = 1; r < STANDALONE_ROWS; r++) {
    standRowY[r] =
      standRowY[r - 1] + standRowHeights[r - 1] + WHOLE_ERD_CONFIG.gutterY;
  }

  const connTotalWidth =
    connColX[COLS - 1] + connColWidths[COLS - 1] + WHOLE_ERD_CONFIG.margin;
  const standTotalWidth =
    standColX[STANDALONE_COLS - 1] +
    standColWidths[STANDALONE_COLS - 1] +
    WHOLE_ERD_CONFIG.margin;
  const pageWidth = Math.max(connTotalWidth, standTotalWidth);
  const pageHeight =
    standRowY[STANDALONE_ROWS - 1] +
    standRowHeights[STANDALONE_ROWS - 1] +
    WHOLE_ERD_CONFIG.margin;

  // Absolute entity bounds for routing
  const entityAbsoluteBounds = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >();
  const moduleContainerBounds = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >();

  // Place Connected modules
  for (let r = 0; r < CONNECTED_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const mod = assignment[r * COLS + c];
      if (!mod || !moduleLayouts.has(mod)) continue;
      const layout = moduleLayouts.get(mod)!;
      const modX = Math.round(
        connColX[c] + (connColWidths[c] - layout.width) / 2,
      );
      const modY = Math.round(
        connRowY[r] + (connRowHeights[r] - layout.height) / 2,
      );
      moduleContainerBounds.set(mod, {
        x: modX,
        y: modY,
        w: layout.width,
        h: layout.height,
      });

      for (const [ent, rpos] of layout.entityPositions.entries()) {
        const h = schemaInfos.get(ent)!.totalHeight;
        entityAbsoluteBounds.set(ent, {
          x: modX + rpos.rx,
          y: modY + rpos.ry,
          w: WHOLE_ERD_CONFIG.entityWidth,
          h,
        });
      }
    }
  }

  // Place Standalone modules
  for (let r = 0; r < STANDALONE_ROWS; r++) {
    for (let c = 0; c < STANDALONE_COLS; c++) {
      const mod = standaloneAssignment[r * STANDALONE_COLS + c];
      if (!mod || !moduleLayouts.has(mod)) continue;
      const layout = moduleLayouts.get(mod)!;
      const modX = Math.round(
        standColX[c] + (standColWidths[c] - layout.width) / 2,
      );
      const modY = Math.round(
        standRowY[r] + (standRowHeights[r] - layout.height) / 2,
      );
      moduleContainerBounds.set(mod, {
        x: modX,
        y: modY,
        w: layout.width,
        h: layout.height,
      });

      for (const [ent, rpos] of layout.entityPositions.entries()) {
        const h = schemaInfos.get(ent)!.totalHeight;
        entityAbsoluteBounds.set(ent, {
          x: modX + rpos.rx,
          y: modY + rpos.ry,
          w: WHOLE_ERD_CONFIG.entityWidth,
          h,
        });
      }
    }
  }

  // Count metrics for verification
  let totalStubsCount = 0;
  let totalStubsRelationships = 0;
  for (const stubs of entityMergedStubs.values()) {
    totalStubsCount += stubs.length;
    for (const s of stubs) {
      totalStubsRelationships += s.count;
    }
  }
  const totalDrawnLines =
    sameModRelations.length + neighborRelations.length + totalStubsCount;

  console.log(`\n================ RELATIONSHIP ACCOUNTING ================`);
  console.log(`Total canonical relationships: ${canonicalRels.length}`);
  console.log(`  - Inline Hub FK text (no line/pill): ${inlineHubCount}`);
  console.log(`  - Self-references: ${selfRefCount}`);
  console.log(`  - Same-module drawn lines: ${sameModRelations.length}`);
  console.log(`  - Neighbor gutter drawn lines: ${neighborRelations.length}`);
  console.log(
    `  - Long-range stub pills: ${totalStubsCount} (representing ${totalStubsRelationships} relationships)`,
  );
  console.log(
    `Check sum: ${inlineHubCount} + ${selfRefCount} + ${sameModRelations.length} + ${neighborRelations.length} + ${totalStubsRelationships} = ${inlineHubCount + selfRefCount + sameModRelations.length + neighborRelations.length + totalStubsRelationships}`,
  );
  console.log(`Total drawn lines on canvas: ${totalDrawnLines}`);
  console.log(`Total stub pills on canvas: ${totalStubsCount}`);
  console.log(`=========================================================\n`);

  // Build Drawio XML
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<mxfile host="Electron" modified="${new Date().toISOString()}" agent="Antigravity" version="24.0.0" type="device">\n`;
  xml += `  <diagram id="Page-1" name="Page-1">\n`;
  xml += `    <mxGraphModel dx="1422" dy="804" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0" background="${theme.canvas.background}">\n`;
  xml += `      <root>\n`;
  xml += `        <mxCell id="0" />\n`;
  xml += `        <mxCell id="1" parent="0" />\n`;

  // Draw Standalone Section Divider Header
  const standaloneY = standStartY - 25;
  const dividerLabelStyle = `text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=13;fontStyle=1;fontColor=${theme.groups.core.title};`;
  xml += `        <mxCell id="standalone_section_label" value="Standalone Modules (No Cross-Module Relationships)" style="${dividerLabelStyle}" vertex="1" parent="1">\n`;
  xml += `          <mxGeometry x="${WHOLE_ERD_CONFIG.margin}" y="${standaloneY}" width="500" height="20" as="geometry" />\n`;
  xml += `        </mxCell>\n`;

  const hubMods = Array.from(hubEntities)
    .map((h) => schemasToRender.get(h)!.moduleName)
    .filter((m, idx, arr) => arr.indexOf(m) === idx);

  // Draw Connected Module Containers & Entities
  for (let r = 0; r < CONNECTED_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const mod = assignment[r * COLS + c];
      if (!mod || !moduleLayouts.has(mod)) continue;
      const layout = moduleLayouts.get(mod)!;
      const mbounds = moduleContainerBounds.get(mod)!;
      const containerId = `column_${mod}`;
      const ents = modEntities.get(mod)!;
      const title = `${capitalize(mod)} (${ents.length})`;

      const isHubMod = hubMods.includes(mod);
      const groupTheme = isHubMod ? theme.groups.core : theme.groups.dependent;

      const containerStyle = `rounded=1;whiteSpace=wrap;html=1;fillColor=${groupTheme.fill};strokeColor=${groupTheme.stroke};strokeWidth=1.5;dashed=1;arcSize=6;align=left;verticalAlign=top;spacingLeft=15;spacingTop=12;fontColor=${groupTheme.title};fontSize=14;fontStyle=1;container=1;collapsible=0;recursiveResize=0;`;

      xml += `        <mxCell id="${containerId}" value="${escapeXml(title)}" style="${containerStyle}" vertex="1" parent="1">\n`;
      xml += `          <mxGeometry x="${mbounds.x}" y="${mbounds.y}" width="${mbounds.w}" height="${mbounds.h}" as="geometry" />\n`;
      xml += `        </mxCell>\n`;

      for (const entName of ents) {
        const info = schemaInfos.get(entName)!;
        const ePos = layout.entityPositions.get(entName)!;
        const tableId = `table_${entName}`;

        const isSub = entName.includes("_");
        const isHub = hubEntities.has(entName);
        const entityRole = isHub ? "core" : isSub ? "dependent" : "lookup";
        const entTheme = theme.entities[entityRole];
        const isDashed = isSub;

        const isEmbeddedChild = childParentMap.has(entName);
        const startSize = isEmbeddedChild ? 46 : 38;
        const headerValue = isEmbeddedChild
          ? `&lt;div style=&quot;font-size:12px;font-weight:bold;&quot;&gt;${escapeXml(entName)}&lt;/div&gt;&lt;div style=&quot;font-size:9px;font-weight:normal;opacity:0.85;&quot;&gt;(embedded in ${escapeXml(childParentMap.get(entName)!)})&lt;/div&gt;`
          : escapeXml(entName);

        const tableStyle = `swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=${startSize};horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${entTheme.headerFill};swimlaneFillColor=${entTheme.bodyFill};strokeColor=${entTheme.border};strokeWidth=2;${isDashed ? "dashed=1;" : ""}fontColor=${entTheme.headerText};fontSize=13;align=center;`;

        xml += `        <mxCell id="${tableId}" value="${headerValue}" style="${tableStyle}" vertex="1" parent="${containerId}">\n`;
        xml += `          <mxGeometry x="${ePos.rx}" y="${ePos.ry}" width="${WHOLE_ERD_CONFIG.entityWidth}" height="${info.totalHeight}" as="geometry" />\n`;
        xml += `        </mxCell>\n`;

        let currentY = startSize;
        for (let i = 0; i < info.labels.length; i++) {
          const fLabel = info.labels[i];
          const fHeight = info.heights[i];

          let rowBg = "none";
          if (fLabel.isPk) {
            rowBg = theme.rows.pkHighlight;
          } else if (fLabel.isFk) {
            rowBg = theme.rows.fkHighlight;
          }

          const rowFontSize = isCompact ? 10 : 11;
          const rowSpacing = isCompact ? 8 : 10;
          const rowStyle = `text;strokeColor=none;fillColor=${rowBg};align=left;verticalAlign=middle;spacingLeft=${rowSpacing};spacingRight=${rowSpacing};overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=${rowFontSize};fontColor=${theme.rows.primaryText};`;

          xml += `        <mxCell id="${fLabel.id}" value="${escapeXml(fLabel.labelHtml)}" style="${rowStyle}" vertex="1" parent="${tableId}">\n`;
          xml += `          <mxGeometry y="${currentY}" width="${WHOLE_ERD_CONFIG.entityWidth}" height="${fHeight}" as="geometry" />\n`;
          xml += `        </mxCell>\n`;
          currentY += fHeight;
        }
      }

      // Draw Stubs inside Module Container
      const modStubs: MergedStub[] = [];
      for (const e of ents) {
        if (entityMergedStubs.has(e)) {
          modStubs.push(...entityMergedStubs.get(e)!);
        }
      }

      for (const stub of modStubs) {
        const sPos = layout.stubPositions.get(stub.id);
        if (!sPos) continue;

        const countSuffix = stub.count > 1 ? ` x${stub.count}` : "";
        const stubLabel = `&rarr; ${stub.refEnt} (${stub.refMod})${countSuffix}`;

        const pillStyle = `rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=${theme.relationships.labelBg};strokeColor=${stub.color};strokeWidth=1.5;fontColor=${theme.relationships.labelText};fontSize=9;align=center;verticalAlign=middle;`;

        xml += `        <mxCell id="${stub.id}" value="${escapeXml(stubLabel)}" style="${pillStyle}" vertex="1" parent="${containerId}">\n`;
        xml += `          <mxGeometry x="${sPos.rx}" y="${sPos.ry}" width="${sPos.w}" height="${sPos.h}" as="geometry" />\n`;
        xml += `        </mxCell>\n`;

        const edgeId = `edge_stub_${stub.id}`;
        const exitEntry = stub.isBelow
          ? "exitX=0.5;exitY=1;entryX=0.5;entryY=0;"
          : "exitX=1;exitY=0.5;entryX=0;entryY=0.5;";
        const stubEdgeStyle = `edgeStyle=straight;html=1;strokeColor=${stub.color};strokeWidth=1.5;dashed=1;endArrow=classic;endSize=4;${exitEntry}`;
        const sourceCell = stub.fkRowId;

        xml += `        <mxCell id="${edgeId}" style="${stubEdgeStyle}" edge="1" parent="1" source="${sourceCell}" target="${stub.id}">\n`;
        xml += `          <mxGeometry relative="1" as="geometry" />\n`;
        xml += `        </mxCell>\n`;
      }
    }
  }

  // Draw Standalone Module Containers & Entities
  for (let r = 0; r < STANDALONE_ROWS; r++) {
    for (let c = 0; c < STANDALONE_COLS; c++) {
      const mod = standaloneAssignment[r * STANDALONE_COLS + c];
      if (!mod || !moduleLayouts.has(mod)) continue;
      const layout = moduleLayouts.get(mod)!;
      const mbounds = moduleContainerBounds.get(mod)!;
      const containerId = `column_${mod}`;
      const ents = modEntities.get(mod)!;
      const title = `${capitalize(mod)} (${ents.length})`;

      const groupTheme = theme.groups.lookup;
      const containerStyle = `rounded=1;whiteSpace=wrap;html=1;fillColor=${groupTheme.fill};strokeColor=${groupTheme.stroke};strokeWidth=1.5;dashed=1;arcSize=6;align=left;verticalAlign=top;spacingLeft=15;spacingTop=12;fontColor=${groupTheme.title};fontSize=14;fontStyle=1;container=1;collapsible=0;recursiveResize=0;`;

      xml += `        <mxCell id="${containerId}" value="${escapeXml(title)}" style="${containerStyle}" vertex="1" parent="1">\n`;
      xml += `          <mxGeometry x="${mbounds.x}" y="${mbounds.y}" width="${mbounds.w}" height="${mbounds.h}" as="geometry" />\n`;
      xml += `        </mxCell>\n`;

      for (const entName of ents) {
        const info = schemaInfos.get(entName)!;
        const ePos = layout.entityPositions.get(entName)!;
        const tableId = `table_${entName}`;

        const isSub = entName.includes("_");
        const entityRole = isSub ? "dependent" : "lookup";
        const entTheme = theme.entities[entityRole];
        const isDashed = isSub;

        const isEmbeddedChild = childParentMap.has(entName);
        const startSize = isEmbeddedChild ? 46 : 38;
        const headerValue = isEmbeddedChild
          ? `&lt;div style=&quot;font-size:12px;font-weight:bold;&quot;&gt;${escapeXml(entName)}&lt;/div&gt;&lt;div style=&quot;font-size:9px;font-weight:normal;opacity:0.85;&quot;&gt;(embedded in ${escapeXml(childParentMap.get(entName)!)})&lt;/div&gt;`
          : escapeXml(entName);

        const tableStyle = `swimlane;fontStyle=1;childLayout=stackLayout;horizontal=1;startSize=${startSize};horizontalStack=0;resizeParent=0;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;whiteSpace=wrap;html=1;fillColor=${entTheme.headerFill};swimlaneFillColor=${entTheme.bodyFill};strokeColor=${entTheme.border};strokeWidth=2;${isDashed ? "dashed=1;" : ""}fontColor=${entTheme.headerText};fontSize=13;align=center;`;

        xml += `        <mxCell id="${tableId}" value="${headerValue}" style="${tableStyle}" vertex="1" parent="${containerId}">\n`;
        xml += `          <mxGeometry x="${ePos.rx}" y="${ePos.ry}" width="${WHOLE_ERD_CONFIG.entityWidth}" height="${info.totalHeight}" as="geometry" />\n`;
        xml += `        </mxCell>\n`;

        let currentY = startSize;
        for (let i = 0; i < info.labels.length; i++) {
          const fLabel = info.labels[i];
          const fHeight = info.heights[i];

          let rowBg = "none";
          if (fLabel.isPk) {
            rowBg = theme.rows.pkHighlight;
          } else if (fLabel.isFk) {
            rowBg = theme.rows.fkHighlight;
          }

          const rowFontSize = isCompact ? 10 : 11;
          const rowSpacing = isCompact ? 8 : 10;
          const rowStyle = `text;strokeColor=none;fillColor=${rowBg};align=left;verticalAlign=middle;spacingLeft=${rowSpacing};spacingRight=${rowSpacing};overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;whiteSpace=wrap;html=1;fontSize=${rowFontSize};fontColor=${theme.rows.primaryText};`;

          xml += `        <mxCell id="${fLabel.id}" value="${escapeXml(fLabel.labelHtml)}" style="${rowStyle}" vertex="1" parent="${tableId}">\n`;
          xml += `          <mxGeometry y="${currentY}" width="${WHOLE_ERD_CONFIG.entityWidth}" height="${fHeight}" as="geometry" />\n`;
          xml += `        </mxCell>\n`;
          currentY += fHeight;
        }
      }
    }
  }

  // Draw Legend Block in a free grid cell of the connected area
  let legendCell: { r: number; c: number } | null = null;
  for (let r = 0; r < CONNECTED_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (assignment[r * COLS + c] === null) {
        legendCell = { r, c };
        break;
      }
    }
    if (legendCell) break;
  }

  if (legendCell) {
    const legW = 340;
    const legH = 270;
    const legX = Math.round(
      connColX[legendCell.c] + (connColWidths[legendCell.c] - legW) / 2,
    );
    const legY = Math.round(
      connRowY[legendCell.r] + (connRowHeights[legendCell.r] - legH) / 2,
    );

    const legContainerStyle = `rounded=1;whiteSpace=wrap;html=1;fillColor=${theme.canvas.background};strokeColor=${theme.groups.core.stroke};strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=14;spacingTop=10;fontColor=${theme.groups.core.title};fontSize=13;fontStyle=1;container=1;collapsible=0;`;

    xml += `        <mxCell id="legend_container" value="ERD Diagram Legend" style="${legContainerStyle}" vertex="1" parent="1">\n`;
    xml += `          <mxGeometry x="${legX}" y="${legY}" width="${legW}" height="${legH}" as="geometry" />\n`;
    xml += `        </mxCell>\n`;

    const badgeStyle = (bg: string, fg: string) =>
      `background-color:${bg};color:${fg};padding:1px 5px;font-size:9px;font-weight:bold;border-radius:3px;display:inline-block;`;

    const legendContent = [
      `<div style="box-sizing:border-box; width:100%; line-height:1.45; overflow-wrap:anywhere; word-break:break-word;">`,
      `<b>Badges:</b><br/>`,
      `<span style="${badgeStyle(theme.badges.pk.fill, theme.badges.pk.text)}">PK</span> Primary Key &nbsp; `,
      `<span style="${badgeStyle(theme.badges.fk.fill, theme.badges.fk.text)}">FK</span> Foreign Key &nbsp; `,
      `<span style="${badgeStyle(theme.badges.uk.fill, theme.badges.uk.text)}">UK</span> Unique<br/>`,
      `<span style="${badgeStyle(theme.badges.idx.fill, theme.badges.idx.text)}">IDX</span> Index &nbsp; `,
      `<span style="${badgeStyle(theme.badges.enum.fill, theme.badges.enum.text)}">ENUM</span> Enumeration`,
      `<br/><br/><b>Hub Entities (Inline Target Text):</b><br/>`,
      `References to Hubs (${Array.from(hubEntities).sort().join(", ")}) are shown inline on the FK row:<br/>`,
      `<code>userId: objectId FK &rarr; User</code> (zero line clutter)`,
      `<br/><br/><b>Drawn Connectors:</b><br/>`,
      `<span style="color:${theme.relationships.foreignKey}; font-weight:bold;">&horbar;&horbar;</span> Same-Module Reference (Solid Blue)<br/>`,
      `<span style="color:${theme.relationships.interModule}; font-weight:bold;">- - -</span> Adjacent Inter-Module Gutter Line (Dashed Slate)<br/>`,
      `<b>&rarr; Target (module)</b>: Long-Range Stub Pill (Margin)`,
      `</div>`,
    ].join("");

    const legTextStyle = `text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=10;spacingRight=10;overflow=visible;rotatable=0;whiteSpace=wrap;html=1;fontSize=10;fontColor=${theme.rows.primaryText};`;

    xml += `        <mxCell id="legend_content" value="${escapeXml(legendContent)}" style="${legTextStyle}" vertex="1" parent="legend_container">\n`;
    xml += `          <mxGeometry x="10" y="32" width="${legW - 20}" height="${legH - 40}" as="geometry" />\n`;
    xml += `        </mxCell>\n`;
  }

  // Draw Same-Module Relationships (Exclusively within internal sub-column channels)
  let edgeIdCounter = 1;
  const modSameLanes = new Map<string, number>();

  for (const sRel of sameModRelations) {
    const rel = sRel.rel;
    const mod = sRel.sMod;
    const layout = moduleLayouts.get(mod);
    const mbounds = moduleContainerBounds.get(mod);
    if (!layout || !mbounds) continue;

    const sourceCellId = definedCellIds.has(
      `field_${rel.target}_${rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_")}`,
    )
      ? `field_${rel.target}_${rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_")}`
      : definedCellIds.has(`field_${rel.target}__id`)
        ? `field_${rel.target}__id`
        : `table_${rel.target}`;

    const targetCellId = definedCellIds.has(`field_${rel.source}__id`)
      ? `field_${rel.source}__id`
      : `table_${rel.source}`;

    const sBounds = entityAbsoluteBounds.get(rel.target);
    const tBounds = entityAbsoluteBounds.get(rel.source);
    if (!sBounds || !tBounds) continue;

    const sPos = layout.entityPositions.get(rel.target)!;
    const tPos = layout.entityPositions.get(rel.source)!;
    const sCol = Math.round(
      (sPos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
        (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
    );
    const tCol = Math.round(
      (tPos.rx - WHOLE_ERD_CONFIG.containerPaddingX) /
        (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap),
    );

    const sInfo = schemaInfos.get(rel.target);
    const tInfo = schemaInfos.get(rel.source);
    const sRowOffset = (sInfo?.rowYOffsets?.get(sourceCellId) ?? 38) + 14;
    const tRowOffset = (tInfo?.rowYOffsets?.get(targetCellId) ?? 38) + 14;
    const sAbsY = Math.round(sBounds.y + sRowOffset);
    const tAbsY = Math.round(tBounds.y + tRowOffset);

    const edgeId = `edge_same_${edgeIdCounter++}`;
    const startArrow = "ERone";
    const endArrow = rel.type === "one-to-one" ? "ERone" : "ERmany";

    let relColor = theme.relationships.foreignKey;
    if (
      rel.fieldPath.includes("$lookup") ||
      rel.fieldPath.includes("virtual") ||
      rel.fieldPath.includes("refPath")
    ) {
      relColor = theme.relationships.embeddedOrLookup;
    }

    const laneKey = `${mod}_${Math.min(sCol, tCol)}_${Math.max(sCol, tCol)}`;
    const lane = modSameLanes.get(laneKey) || 0;
    modSameLanes.set(laneKey, lane + 1);
    const laneOffset = ((lane % 3) - 1) * 3;

    let exitParams = "";
    let entryParams = "";
    const waypoints: { x: number; y: number }[] = [];

    if (sCol === tCol) {
      const channelBaseX = Math.round(
        mbounds.x +
          (sCol === 0
            ? Math.round(WHOLE_ERD_CONFIG.containerPaddingX / 2)
            : WHOLE_ERD_CONFIG.containerPaddingX +
              sCol *
                (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) -
              WHOLE_ERD_CONFIG.subColumnGap / 2),
      );
      const laneX = channelBaseX + laneOffset;
      exitParams = "exitX=0;exitY=0.5;";
      entryParams = "entryX=0;entryY=0.5;";
      waypoints.push({ x: laneX, y: sAbsY });
      waypoints.push({ x: laneX, y: tAbsY });
    } else if (tCol === sCol + 1) {
      const channelBaseX = Math.round(
        mbounds.x +
          WHOLE_ERD_CONFIG.containerPaddingX +
          sCol *
            (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) +
          WHOLE_ERD_CONFIG.entityWidth +
          WHOLE_ERD_CONFIG.subColumnGap / 2,
      );
      const laneX = channelBaseX + laneOffset;
      exitParams = "exitX=1;exitY=0.5;";
      entryParams = "entryX=0;entryY=0.5;";
      waypoints.push({ x: laneX, y: sAbsY });
      waypoints.push({ x: laneX, y: tAbsY });
    } else if (tCol === sCol - 1) {
      const channelBaseX = Math.round(
        mbounds.x +
          WHOLE_ERD_CONFIG.containerPaddingX +
          tCol *
            (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) +
          WHOLE_ERD_CONFIG.entityWidth +
          WHOLE_ERD_CONFIG.subColumnGap / 2,
      );
      const laneX = channelBaseX + laneOffset;
      exitParams = "exitX=0;exitY=0.5;";
      entryParams = "entryX=1;entryY=0.5;";
      waypoints.push({ x: laneX, y: sAbsY });
      waypoints.push({ x: laneX, y: tAbsY });
    } else {
      // Multi-column jump: route via interior corridor (safely away from container border and entity bottoms)
      const bottomY = mbounds.y + mbounds.h - 18 - laneOffset;
      const c1X = Math.round(
        mbounds.x +
          WHOLE_ERD_CONFIG.containerPaddingX +
          (sCol < tCol
            ? sCol *
                (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) +
              WHOLE_ERD_CONFIG.entityWidth +
              WHOLE_ERD_CONFIG.subColumnGap / 2
            : sCol *
                (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) -
              WHOLE_ERD_CONFIG.subColumnGap / 2) +
          laneOffset,
      );
      const c2X = Math.round(
        mbounds.x +
          WHOLE_ERD_CONFIG.containerPaddingX +
          (sCol < tCol
            ? tCol *
                (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) -
              WHOLE_ERD_CONFIG.subColumnGap / 2
            : tCol *
                (WHOLE_ERD_CONFIG.entityWidth + WHOLE_ERD_CONFIG.subColumnGap) +
              WHOLE_ERD_CONFIG.entityWidth +
              WHOLE_ERD_CONFIG.subColumnGap / 2) +
          laneOffset,
      );
      exitParams = sCol < tCol ? "exitX=1;exitY=0.5;" : "exitX=0;exitY=0.5;";
      entryParams =
        sCol < tCol ? "entryX=0;entryY=0.5;" : "entryX=1;entryY=0.5;";
      waypoints.push({ x: c1X, y: sAbsY });
      waypoints.push({ x: c1X, y: bottomY });
      waypoints.push({ x: c2X, y: bottomY });
      waypoints.push({ x: c2X, y: tAbsY });
    }

    // In compact mode, suppress same-module line label to avoid label pile-up
    const edgeLabelVal = isCompact ? "" : escapeXml(rel.fieldPath);
    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${relColor};strokeWidth=1.5;dashed=0;startArrow=${startArrow};startFill=0;endArrow=${endArrow};endFill=0;${exitParams}${entryParams}fontSize=10;fontColor=${theme.relationships.labelText};labelBackgroundColor=${theme.relationships.labelBg};labelBorderColor=${theme.relationships.labelBorder};`;

    xml += `        <mxCell id="${edgeId}" value="${edgeLabelVal}" style="${edgeStyle}" edge="1" parent="1" source="${sourceCellId}" target="${targetCellId}">\n`;
    xml += `          <mxGeometry relative="1" as="geometry">\n`;
    xml += `            <Array as="points">\n`;
    for (const pt of waypoints) {
      xml += `              <mxPoint x="${pt.x}" y="${pt.y}" />\n`;
    }
    xml += `            </Array>\n`;
    xml += `          </mxGeometry>\n`;
    xml += `        </mxCell>\n`;
  }

  // Draw Neighbor Cross-Module Relationships (Exclusively through Gutter Corridors)
  const gutterLanes = new Map<string, number>();

  for (const nRel of neighborRelations) {
    const sPos = modToCell.get(nRel.sourceMod)!;
    const tPos = modToCell.get(nRel.targetMod)!;

    const sBounds = entityAbsoluteBounds.get(nRel.sourceEnt);
    const tBounds = entityAbsoluteBounds.get(nRel.targetEnt);
    if (!sBounds || !tBounds) continue;

    const sInfo = schemaInfos.get(nRel.sourceEnt);
    const tInfo = schemaInfos.get(nRel.targetEnt);
    const sRowOffset = (sInfo?.rowYOffsets?.get(nRel.sourceCellId) ?? 38) + 14;
    const tRowOffset = (tInfo?.rowYOffsets?.get(nRel.targetCellId) ?? 38) + 14;

    const sAbsY = Math.round(sBounds.y + sRowOffset);
    const tAbsY = Math.round(tBounds.y + tRowOffset);

    const edgeId = `edge_nbr_${edgeIdCounter++}`;
    const startArrow = "ERone";
    const endArrow = nRel.rel.type === "one-to-one" ? "ERone" : "ERmany";

    let exitParams = "";
    let entryParams = "";
    const waypoints: { x: number; y: number }[] = [];

    const isHorizontal = sPos.r === tPos.r;

    if (isHorizontal) {
      if (tPos.c > sPos.c) {
        // Target is to the Right -> Vertical gutter between sPos.c and tPos.c
        const gutterKey = `H_${sPos.r}_${sPos.c}`;
        const lane = gutterLanes.get(gutterKey) || 0;
        gutterLanes.set(gutterKey, lane + 1);
        const laneOffset = ((lane % 5) - 2) * 12;

        const gutterXMid = Math.round(
          connColX[sPos.c] +
            connColWidths[sPos.c] +
            WHOLE_ERD_CONFIG.gutterX / 2 +
            laneOffset,
        );
        exitParams = "exitX=1;exitY=0.5;";
        entryParams = "entryX=0;entryY=0.5;";
        waypoints.push({ x: gutterXMid, y: sAbsY });
        waypoints.push({ x: gutterXMid, y: tAbsY });
      } else {
        // Target is to the Left -> Vertical gutter between tPos.c and sPos.c
        const gutterKey = `H_${sPos.r}_${tPos.c}`;
        const lane = gutterLanes.get(gutterKey) || 0;
        gutterLanes.set(gutterKey, lane + 1);
        const laneOffset = ((lane % 5) - 2) * 12;

        const gutterXMid = Math.round(
          connColX[tPos.c] +
            connColWidths[tPos.c] +
            WHOLE_ERD_CONFIG.gutterX / 2 +
            laneOffset,
        );
        exitParams = "exitX=0;exitY=0.5;";
        entryParams = "entryX=1;entryY=0.5;";
        waypoints.push({ x: gutterXMid, y: sAbsY });
        waypoints.push({ x: gutterXMid, y: tAbsY });
      }
    } else {
      // Vertically adjacent -> Horizontal gutter corridor between rows
      const minR = Math.min(sPos.r, tPos.r);
      const gutterKey = `V_${minR}_${sPos.c}`;
      const lane = gutterLanes.get(gutterKey) || 0;
      gutterLanes.set(gutterKey, lane + 1);
      const laneOffset = ((lane % 5) - 2) * 12;

      const gutterYMid = Math.round(
        connRowY[minR] +
          connRowHeights[minR] +
          WHOLE_ERD_CONFIG.gutterY / 2 +
          laneOffset,
      );

      if (tPos.r > sPos.r) {
        // Target is Below
        exitParams = "exitX=0.5;exitY=1;";
        entryParams = "entryX=0.5;entryY=0;";
        waypoints.push({
          x: Math.round(sBounds.x + sBounds.w / 2),
          y: gutterYMid,
        });
        waypoints.push({
          x: Math.round(tBounds.x + tBounds.w / 2),
          y: gutterYMid,
        });
      } else {
        // Target is Above
        exitParams = "exitX=0.5;exitY=0;";
        entryParams = "entryX=0.5;entryY=1;";
        waypoints.push({
          x: Math.round(sBounds.x + sBounds.w / 2),
          y: gutterYMid,
        });
        waypoints.push({
          x: Math.round(tBounds.x + tBounds.w / 2),
          y: gutterYMid,
        });
      }
    }

    const edgeStyle = `edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=${nRel.color};strokeWidth=1.5;dashed=1;startArrow=${startArrow};startFill=0;endArrow=${endArrow};endFill=0;${exitParams}${entryParams}fontSize=11;fontColor=${theme.relationships.labelText};labelBackgroundColor=${theme.relationships.labelBg};labelBorderColor=${theme.relationships.labelBorder};`;

    xml += `        <mxCell id="${edgeId}" value="${escapeXml(nRel.rel.fieldPath)}" style="${edgeStyle}" edge="1" parent="1" source="${nRel.sourceCellId}" target="${nRel.targetCellId}">\n`;
    xml += `          <mxGeometry relative="1" as="geometry">\n`;
    xml += `            <Array as="points">\n`;
    for (const pt of waypoints) {
      xml += `              <mxPoint x="${pt.x}" y="${pt.y}" />\n`;
    }
    xml += `            </Array>\n`;
    xml += `          </mxGeometry>\n`;
    xml += `        </mxCell>\n`;
  }

  xml += `      </root>\n`;
  xml += `    </mxGraphModel>\n`;
  xml += `  </diagram>\n`;
  xml += `</mxfile>\n`;

  // ─── Stub Source Audit ────────────────────────────────────────────────────────
  console.log(
    `\n========================================================================================`,
  );
  console.log(`STUB SOURCE AUDIT TABLE`);
  console.log(
    `========================================================================================`,
  );
  console.log(
    `| Stub ID | Stub Label | Source Entity | Source Field | Target Entity | Valid Row? | Target Schema Match? |`,
  );
  console.log(`| :--- | :--- | :--- | :--- | :--- | :---: | :---: |`);

  let stubMismatches = 0;
  for (const [entName, stubs] of entityMergedStubs.entries()) {
    for (const s of stubs) {
      const isVisibleRow =
        s.fkRowId.startsWith(`field_${s.fkEnt}_`) &&
        definedCellIds.has(s.fkRowId);
      const isTargetValid = schemasToRender.has(s.refEnt);
      const cleanField = s.fkRowId.startsWith(`field_${s.fkEnt}_`)
        ? s.fkRowId.slice(`field_${s.fkEnt}_`.length)
        : "(table-level)";

      if (!isVisibleRow || !isTargetValid) {
        stubMismatches++;
      }

      console.log(
        `| ${s.id} | &rarr; ${s.refEnt} (${s.refMod}) | ${s.fkEnt} | ${cleanField} | ${s.refEnt} | ${isVisibleRow ? "YES" : "NO"} | ${isTargetValid ? "YES" : "NO"} |`,
      );
    }
  }
  console.log(
    `========================================================================================`,
  );
  if (stubMismatches > 0) {
    throw new Error(
      `[Stub Audit Failed] Found ${stubMismatches} stub(s) with invalid source rows or invalid targets!`,
    );
  }

  // ─── Relationship Visibility Audit ───────────────────────────────────────────
  let visInlineHub = 0;
  let visInlineSelf = 0;
  let visInlineEmbedded = 0;
  let visDrawnLines = 0;
  let visStubPills = 0;
  const invisibleRels: CanonicalRelationship[] = [];

  for (const rel of canonicalRels) {
    const cleanField = rel.fieldPath.replace(/[^a-zA-Z0-9_]/g, "_");
    const fkRowId = `field_${rel.fkEnt}_${cleanField}`;
    const matchingRowId = definedCellIds.has(fkRowId)
      ? fkRowId
      : Array.from(definedCellIds).find(
          (id) =>
            id.startsWith(`field_${rel.fkEnt}_`) &&
            (id.endsWith(`_${cleanField}`) || id.includes(cleanField)),
        );

    // 1. Check if represented via inline arrow in row
    let isRowInline = false;
    if (matchingRowId) {
      const eInfo = schemaInfos.get(rel.fkEnt);
      const rowLabel = eInfo?.labels.find((l) => l.id === matchingRowId);
      if (
        rowLabel &&
        (rowLabel.labelHtml.includes("&rarr;") ||
          rowLabel.labelHtml.includes("→"))
      ) {
        if (rel.fkEnt === rel.refEnt) {
          visInlineSelf++;
          isRowInline = true;
        } else if (hubEntities.has(rel.refEnt)) {
          visInlineHub++;
          isRowInline = true;
        } else if (rel.isParentChild) {
          visInlineEmbedded++;
          isRowInline = true;
        }
      }
    }
    if (isRowInline) continue;

    // 2. Check if embedded child represented via child table header subtitle
    if (rel.isParentChild && childParentMap.get(rel.fkEnt) === rel.refEnt) {
      visInlineEmbedded++;
      continue;
    }

    // 3. Check if represented via drawn edge in xml
    const edgePattern1 = `source="field_${rel.refEnt}__id" target="${matchingRowId || `field_${rel.fkEnt}_`}`;
    const edgePattern2 = `source="${matchingRowId || `field_${rel.fkEnt}_`}" target="field_${rel.refEnt}__id"`;
    if (
      xml.includes(edgePattern1) ||
      xml.includes(edgePattern2) ||
      xml.includes(`source="table_${rel.refEnt}" target="table_${rel.fkEnt}"`)
    ) {
      visDrawnLines++;
      continue;
    }

    // 4. Check if represented via stub pill
    const hasStub = Array.from(entityMergedStubs.get(rel.fkEnt) || []).some(
      (s) =>
        s.refEnt === rel.refEnt &&
        (s.fkRowId === matchingRowId || !matchingRowId),
    );
    if (hasStub) {
      visStubPills++;
      continue;
    }

    // 5. Self-reference fallback
    if (rel.fkEnt === rel.refEnt) {
      visInlineSelf++;
      continue;
    }

    invisibleRels.push(rel);
  }

  console.log(`\n============================================================`);
  console.log(`RELATIONSHIP VISIBILITY AUDIT`);
  console.log(`============================================================`);
  console.log(`Total Canonical Relationships: ${canonicalRels.length}`);
  console.log(`- Inline Hub References:       ${visInlineHub}`);
  console.log(`- Inline Self-References:      ${visInlineSelf}`);
  console.log(`- Inline Embedded Children:    ${visInlineEmbedded}`);
  console.log(`- Drawn Direct Lines:          ${visDrawnLines}`);
  console.log(`- Stub Pills (Margin):         ${visStubPills}`);
  console.log(`- Invisible Relationships:     ${invisibleRels.length}`);
  console.log(`============================================================\n`);

  if (invisibleRels.length > 0) {
    console.error(
      `[Visibility Audit Failed] The following ${invisibleRels.length} relationship(s) are invisible:`,
    );
    for (const inv of invisibleRels) {
      console.error(
        `  - ${inv.fkEnt}.${inv.fieldPath} -> ${inv.refEnt} (${inv.kind})`,
      );
    }
    throw new Error(
      `[Relationship Visibility Audit Failed] ${invisibleRels.length} relationship(s) have no visible representation in the whole ER diagram!`,
    );
  }

  return xml;
}

// MODULE MAP DIAGRAM GENERATOR
// ----------------------------------------------------
export function buildModuleMapDiagram(
  nativeSchemas: ExtractedSchema[],
  allSchemasMap: Map<string, ExtractedSchema>,
  moduleMap: Map<string, string[]>,
  codeRelations: Relationship[] = [],
): string {
  const theme = getActiveTheme();

  // Find all unique relationships across schemas
  const relationships: Relationship[] = [...codeRelations];

  for (const s of nativeSchemas) {
    for (const f of s.fields) {
      if (f.ref) {
        relationships.push({
          source: f.ref,
          target: s.name,
          type: "one-to-many",
          label: f.name,
        });
      }
    }
    for (const v of s.virtuals) {
      if (v.ref && v.localField && v.foreignField) {
        relationships.push({
          source: s.name,
          target: v.ref,
          type: "one-to-many",
          label: v.name,
        });
      }
    }
  }

  const uniqueRelationships: Relationship[] = [];
  const seenRels = new Set<string>();
  for (const rel of relationships) {
    if (!allSchemasMap.has(rel.source) || !allSchemasMap.has(rel.target)) {
      continue;
    }
    const key = `${rel.source}-${rel.target}-${rel.label}`;
    const rev = `${rel.target}-${rel.source}-${rel.label}`;
    if (seenRels.has(key) || seenRels.has(rev)) continue;
    seenRels.add(key);
    uniqueRelationships.push(rel);
  }

  // Count incoming distinct referencing entities for hub identification
  const incomingRefs = new Map<string, Set<string>>();
  for (const s of nativeSchemas) {
    incomingRefs.set(s.name, new Set());
  }

  for (const rel of uniqueRelationships) {
    let refEnt = rel.source;
    let fkEnt = rel.target;
    if (rel.label.includes("(virtual)")) {
      refEnt = rel.target;
      fkEnt = rel.source;
    } else if (rel.source === rel.target) {
      refEnt = rel.source;
      fkEnt = rel.target;
    }
    if (fkEnt !== refEnt && incomingRefs.has(refEnt)) {
      incomingRefs.get(refEnt)!.add(fkEnt);
    }
  }

  // Identify Hub Entities using adaptive threshold (or ERD_HUB_MIN_REFS override)
  const hubThreshold = computeHubThreshold(incomingRefs);
  const hubs = new Set<string>();
  for (const [name, set] of incomingRefs.entries()) {
    if (set.size >= hubThreshold) {
      hubs.add(name);
    }
  }

  // Active modules
  const allActiveMods = Array.from(moduleMap.keys())
    .filter((m) => (moduleMap.get(m)?.length ?? 0) > 0)
    .sort();

  // Module dependencies on Hub entities (for small chips inside module nodes)
  const modHubDeps = new Map<string, Set<string>>();
  for (const m of allActiveMods) {
    modHubDeps.set(m, new Set<string>());
  }

  // Module-to-module non-hub edge counts
  const modPairCounts = new Map<
    string,
    { count: number; m1: string; m2: string }
  >();

  for (const rel of uniqueRelationships) {
    const sMod = allSchemasMap.get(rel.source)?.moduleName;
    const tMod = allSchemasMap.get(rel.target)?.moduleName;
    if (!sMod || !tMod || sMod === tMod) continue;

    let refEnt = rel.source;
    let fkEnt = rel.target;
    if (rel.label.includes("(virtual)")) {
      refEnt = rel.target;
      fkEnt = rel.source;
    }

    if (hubs.has(refEnt)) {
      // Record hub dependency chip
      const fkMod = allSchemasMap.get(fkEnt)?.moduleName;
      if (fkMod && modHubDeps.has(fkMod)) {
        modHubDeps.get(fkMod)!.add(refEnt);
      }
    } else {
      // Record non-hub module pair connection
      const pairKey = sMod < tMod ? `${sMod}|${tMod}` : `${tMod}|${sMod}`;
      const [m1, m2] = pairKey.split("|");
      if (!modPairCounts.has(pairKey)) {
        modPairCounts.set(pairKey, { count: 0, m1, m2 });
      }
      modPairCounts.get(pairKey)!.count++;
    }
  }

  // Partition into Connected vs Standalone
  const connectedModsSet = new Set<string>();
  for (const item of modPairCounts.values()) {
    connectedModsSet.add(item.m1);
    connectedModsSet.add(item.m2);
  }
  for (const h of hubs) {
    const m = allSchemasMap.get(h)?.moduleName;
    if (m) connectedModsSet.add(m);
  }
  for (const [mod, deps] of modHubDeps.entries()) {
    if (deps.size > 0) connectedModsSet.add(mod);
  }

  const standaloneMods = allActiveMods
    .filter((m) => !connectedModsSet.has(m))
    .sort();
  const connectedMods = Array.from(connectedModsSet).sort();

  // Layout for Module Map: 16:10 Landscape Canvas
  // 8 Columns grid layout for connected modules
  const COLS = 8;
  const nodeWidth = 195;
  const nodeHeight = 85;
  const hubNodeWidth = 235;
  const hubNodeHeight = 95;
  const cellGapX = 75;
  const cellGapY = 65;
  const margin = 50;

  // Node position map
  const nodePositions = new Map<
    string,
    { x: number; y: number; w: number; h: number; isHub: boolean }
  >();

  const hubList = Array.from(hubs)
    .map((h) => allSchemasMap.get(h)?.moduleName)
    .filter((m): m is string => Boolean(m));

  // Data-driven grid placement via local search (same algorithm as whole-diagram).
  // COLS chosen to approach a landscape aspect ratio; no module names hardcoded.
  const connectedCount = connectedMods.length;
  const MAP_COLS =
    connectedCount > 0
      ? Math.max(3, Math.round(Math.sqrt(connectedCount * 2.0)))
      : 3;
  const MAP_ROWS = Math.ceil(connectedCount / MAP_COLS);
  const MAP_CELLS = MAP_ROWS * MAP_COLS;

  // Build cross-weight map for placement optimisation
  const mapCrossWeights = new Map<string, number>();
  for (const item of modPairCounts.values()) {
    const pair =
      item.m1 < item.m2 ? `${item.m1}|${item.m2}` : `${item.m2}|${item.m1}`;
    mapCrossWeights.set(pair, (mapCrossWeights.get(pair) || 0) + item.count);
  }

  // Initial placement: sorted A-Z in row-major order
  const mapAssignment: (string | null)[] = new Array(MAP_CELLS).fill(null);
  const mapCoords = new Map<string, { r: number; c: number }>();
  {
    let idx = 0;
    for (const m of connectedMods) {
      mapAssignment[idx] = m;
      mapCoords.set(m, { r: Math.floor(idx / MAP_COLS), c: idx % MAP_COLS });
      idx++;
    }
  }

  // Local search optimisation
  const mapCost = () => {
    let c = 0;
    for (const [pair, w] of mapCrossWeights.entries()) {
      const [a, b] = pair.split("|");
      const pa = mapCoords.get(a);
      const pb = mapCoords.get(b);
      if (pa && pb) c += w * (Math.abs(pa.r - pb.r) + Math.abs(pa.c - pb.c));
    }
    return c;
  };
  let mapSeed = WHOLE_ERD_CONFIG.prngSeed;
  const mapLcg = () => {
    mapSeed = (mapSeed * 1664525 + 1013904223) % 4294967296;
    return mapSeed / 4294967296;
  };
  let mapBest = mapCost();
  const MAP_ITERS = Math.min(20000, WHOLE_ERD_CONFIG.localSearchIterations);
  for (let iter = 0; iter < MAP_ITERS; iter++) {
    const i1 = Math.floor(mapLcg() * MAP_CELLS);
    const i2 = Math.floor(mapLcg() * MAP_CELLS);
    if (i1 === i2) continue;
    const m1n = mapAssignment[i1];
    const m2n = mapAssignment[i2];
    if (!m1n && !m2n) continue;
    mapAssignment[i1] = m2n;
    mapAssignment[i2] = m1n;
    if (m1n)
      mapCoords.set(m1n, { r: Math.floor(i2 / MAP_COLS), c: i2 % MAP_COLS });
    if (m2n)
      mapCoords.set(m2n, { r: Math.floor(i1 / MAP_COLS), c: i1 % MAP_COLS });
    const nc = mapCost();
    if (nc < mapBest) {
      mapBest = nc;
    } else {
      mapAssignment[i1] = m1n;
      mapAssignment[i2] = m2n;
      if (m1n)
        mapCoords.set(m1n, { r: Math.floor(i1 / MAP_COLS), c: i1 % MAP_COLS });
      if (m2n)
        mapCoords.set(m2n, { r: Math.floor(i2 / MAP_COLS), c: i2 % MAP_COLS });
    }
  }

  // Assign pixel positions from grid coords
  for (const m of connectedMods) {
    const gc = mapCoords.get(m)!;
    const isHub = hubList.includes(m);
    const w = isHub ? hubNodeWidth : nodeWidth;
    const h = isHub ? hubNodeHeight : nodeHeight;
    const x = margin + gc.c * (nodeWidth + cellGapX) + (isHub ? -20 : 0);
    const y = margin + gc.r * (nodeHeight + cellGapY) + (isHub ? -5 : 0);
    nodePositions.set(m, { x, y, w, h, isHub });
  }

  // Legend: compute dynamic content, dimensions, and collision-free placement
  const hubNameList =
    hubs.size > 0 ? Array.from(hubs).sort().join(", ") : "None";
  const firstHub = Array.from(hubs)[0] || "Hub";

  const legW = 500;
  const innerPadX = 14;
  const usableLegTextWidth = legW - innerPadX * 2;
  const charsPerLine = Math.max(30, Math.floor(usableLegTextWidth / 5.8));

  const p1 =
    "Module Roles: ■ Core / Hub (Center Nodes)   ■ Lookup / Config / Reference   ■ Dependent / Activity";
  const p2 = `Hub Dependencies: [${firstHub}] Chips indicate references to hub entities (${hubNameList})`;
  const p3 = "Connectors: -- Direct non-hub dependency with relationship count";

  const lines1 = Math.ceil(p1.length / charsPerLine) || 1;
  const lines2 = Math.ceil(p2.length / charsPerLine) || 1;
  const lines3 = Math.ceil(p3.length / charsPerLine) || 1;
  const totalEstimatedLines = lines1 + lines2 + lines3;

  // 17px per line + 8px gap between sections + 28px container header + 24px bottom buffer
  const estimatedContentHeight = totalEstimatedLines * 17 + 16;
  const legH = Math.max(120, Math.round(28 + estimatedContentHeight + 24));

  const colSpan = Math.ceil(legW / (nodeWidth + cellGapX));
  let legPos: { x: number; y: number } | null = null;

  // 1. Search for consecutive empty cells in the connected grid, starting from bottom row
  for (let r = MAP_ROWS - 1; r >= 0; r--) {
    for (let c = 0; c <= MAP_COLS - colSpan; c++) {
      let allEmpty = true;
      for (let k = 0; k < colSpan; k++) {
        if (mapAssignment[r * MAP_COLS + (c + k)] !== null) {
          allEmpty = false;
          break;
        }
      }
      if (allEmpty) {
        legPos = {
          x: margin + c * (nodeWidth + cellGapX),
          y: margin + r * (nodeHeight + cellGapY),
        };
        break;
      }
    }
    if (legPos) break;
  }

  // 2. Fallback: check if the row has trailing empty cells
  if (!legPos) {
    for (let r = MAP_ROWS - 1; r >= 0; r--) {
      for (let c = MAP_COLS - 1; c >= 0; c--) {
        if (mapAssignment[r * MAP_COLS + c] === null) {
          let tailEmpty = true;
          for (let k = c; k < MAP_COLS; k++) {
            if (mapAssignment[r * MAP_COLS + k] !== null) {
              tailEmpty = false;
              break;
            }
          }
          if (tailEmpty) {
            legPos = {
              x: margin + c * (nodeWidth + cellGapX),
              y: margin + r * (nodeHeight + cellGapY),
            };
            break;
          }
        }
      }
      if (legPos) break;
    }
  }

  // 3. Fallback: place below connected grid
  if (!legPos) {
    legPos = {
      x: margin,
      y: margin + MAP_ROWS * (nodeHeight + cellGapY) + 20,
    };
  }

  const legX = legPos.x;
  const legY = legPos.y;

  // Standalone modules below BOTH the connected grid and the legend
  const connectedBottomY = Math.max(
    margin + MAP_ROWS * (nodeHeight + cellGapY),
    legY + legH + 20,
  );
  const standaloneStartY =
    standaloneMods.length > 0 ? connectedBottomY + 40 : connectedBottomY;
  const sNodeWidth = 160;
  const sNodeHeight = 65;
  const sGapX = 40;
  const sGapY = 25;
  const STANDALONE_COLS =
    standaloneMods.length > 0
      ? Math.max(4, Math.round(Math.sqrt(standaloneMods.length * 3)))
      : 4;

  for (let i = 0; i < standaloneMods.length; i++) {
    const m = standaloneMods[i];
    const r = Math.floor(i / STANDALONE_COLS);
    const c = i % STANDALONE_COLS;
    const x = margin + c * (sNodeWidth + sGapX);
    const y = standaloneStartY + r * (sNodeHeight + sGapY);
    nodePositions.set(m, { x, y, w: sNodeWidth, h: sNodeHeight, isHub: false });
  }

  // Canvas bounds
  let maxX = 0;
  let maxY = 0;
  for (const pos of nodePositions.values()) {
    maxX = Math.max(maxX, pos.x + pos.w);
    maxY = Math.max(maxY, pos.y + pos.h);
  }
  maxX = Math.max(maxX, legX + legW);
  maxY = Math.max(maxY, legY + legH);

  const pageWidth = Math.round(maxX + margin);
  const pageHeight = Math.round(maxY + margin);

  // Role classification derived from relationship structure (no module/entity names used).
  // Core: hub module. Lookup: primarily referenced by others (more in-edges than out-edges as FK target).
  // Dependent: primarily references others. Else: core.
  const modOutDegree = new Map<string, number>(); // module references other modules
  const modInDegree = new Map<string, number>(); // other modules reference this module
  for (const m of allActiveMods) {
    modOutDegree.set(m, 0);
    modInDegree.set(m, 0);
  }
  for (const item of modPairCounts.values()) {
    modOutDegree.set(item.m1, (modOutDegree.get(item.m1) || 0) + item.count);
    modInDegree.set(item.m2, (modInDegree.get(item.m2) || 0) + item.count);
    modOutDegree.set(item.m2, (modOutDegree.get(item.m2) || 0) + item.count);
    modInDegree.set(item.m1, (modInDegree.get(item.m1) || 0) + item.count);
  }
  const getModuleRole = (modName: string): "core" | "lookup" | "dependent" => {
    if (hubList.includes(modName)) return "core";
    const out = modOutDegree.get(modName) || 0;
    const inp = modInDegree.get(modName) || 0;
    if (inp > out * 1.5) return "lookup"; // mainly referenced (lookup/config)
    if (out > inp * 1.5) return "dependent"; // mainly references others
    return "core";
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<mxfile host="Electron" modified="${new Date().toISOString()}" agent="Antigravity" version="24.0.0" type="device">\n`;
  xml += `  <diagram id="Page-1" name="Module-Map">\n`;
  xml += `    <mxGraphModel dx="1422" dy="804" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0" background="${theme.canvas.background}">\n`;
  xml += `      <root>\n`;
  xml += `        <mxCell id="0" />\n`;
  xml += `        <mxCell id="1" parent="0" />\n`;

  // Draw Standalone section title only if standalone modules exist
  if (standaloneMods.length > 0) {
    const sLabelStyle = `text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=13;fontStyle=1;fontColor=${theme.groups.core.title};`;
    xml += `        <mxCell id="section_standalone_map" value="Standalone Modules (No Cross-Module Relationships)" style="${sLabelStyle}" vertex="1" parent="1">\n`;
    xml += `          <mxGeometry x="${margin}" y="${standaloneStartY - 24}" width="500" height="20" as="geometry" />\n`;
    xml += `        </mxCell>\n`;
  }

  // Draw Module Nodes
  for (const [modName, pos] of nodePositions.entries()) {
    const ents = moduleMap.get(modName) || [];
    const role = getModuleRole(modName);
    const entTheme = theme.entities[role];
    const hubDeps = modHubDeps.get(modName) || new Set<string>();

    let hubChipsHtml = "";
    if (hubDeps.size > 0) {
      const chips = Array.from(hubDeps)
        .map(
          (h) =>
            `<span style="background-color:${theme.badges.fk.fill};color:${theme.badges.fk.text};padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;margin-right:3px;">${h}</span>`,
        )
        .join("");
      hubChipsHtml = `<div style="margin-top:5px;">${chips}</div>`;
    }

    const titleSize = pos.isHub ? "15px" : "13px";
    const titleColor = entTheme.headerFill;
    const nodeContent = `<div style="text-align:center;"><b><span style="font-size:${titleSize}; color:${titleColor};">${capitalize(modName)}</span></b><div style="font-size:10px; color:${theme.rows.mutedText}; font-weight:600; margin-top:2px;">${ents.length} ${ents.length === 1 ? "entity" : "entities"}</div>${hubChipsHtml}</div>`;

    const strokeW = pos.isHub ? "2.5" : "1.5";
    const nodeStyle = `rounded=1;arcSize=10;whiteSpace=wrap;html=1;fillColor=${entTheme.bodyFill};strokeColor=${entTheme.border};strokeWidth=${strokeW};fontColor=${titleColor};align=center;verticalAlign=middle;`;

    xml += `        <mxCell id="node_${modName}" value="${escapeXml(nodeContent)}" style="${nodeStyle}" vertex="1" parent="1">\n`;
    xml += `          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" as="geometry" />\n`;
    xml += `        </mxCell>\n`;
  }

  // Draw Legend Container
  const legContainerStyle = `rounded=1;whiteSpace=wrap;html=1;fillColor=${theme.canvas.background};strokeColor=${theme.groups.core.stroke};strokeWidth=1.5;align=left;verticalAlign=top;spacingLeft=14;spacingTop=8;fontColor=${theme.groups.core.title};fontSize=12;fontStyle=1;container=1;collapsible=0;`;

  xml += `        <mxCell id="legend_map_container" value="Module Map Legend" style="${legContainerStyle}" vertex="1" parent="1">\n`;
  xml += `          <mxGeometry x="${legX}" y="${legY}" width="${legW}" height="${legH}" as="geometry" />\n`;
  xml += `        </mxCell>\n`;

  const legendContent = [
    `<div style="box-sizing:border-box; width:100%; line-height:1.5; overflow-wrap:anywhere; word-break:break-word;">`,
    `<b>Module Roles:</b> `,
    `<span style="color:${theme.entities.core.border}; font-weight:bold;">&#9632;</span> Core / Hub (Center Nodes) &nbsp;&nbsp; `,
    `<span style="color:${theme.entities.lookup.border}; font-weight:bold;">&#9632;</span> Lookup / Config / Reference &nbsp;&nbsp; `,
    `<span style="color:${theme.entities.dependent.border}; font-weight:bold;">&#9632;</span> Dependent / Activity<br/>`,
    `<b>Hub Dependencies:</b> `,
    `<span style="background-color:${theme.badges.fk.fill};color:${theme.badges.fk.text};padding:1px 5px;border-radius:3px;font-size:9px;font-weight:bold;">${firstHub}</span> Chips indicate references to hub entities (${hubNameList})<br/>`,
    `<b>Connectors:</b> `,
    `<span style="color:${theme.relationships.interModule}; font-weight:bold;">&horbar;&horbar;</span> Direct non-hub dependency with relationship count`,
    `</div>`,
  ].join("");

  const legTextStyle = `text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=10;spacingRight=10;overflow=visible;rotatable=0;whiteSpace=wrap;html=1;fontSize=10;fontColor=${theme.rows.primaryText};`;

  xml += `        <mxCell id="legend_map_content" value="${escapeXml(legendContent)}" style="${legTextStyle}" vertex="1" parent="legend_map_container">\n`;
  xml += `          <mxGeometry x="12" y="26" width="${legW - 24}" height="${legH - 32}" as="geometry" />\n`;
  xml += `        </mxCell>\n`;

  // Draw Edges with explicit collision-free routing
  let mapEdgeId = 1;
  for (const item of modPairCounts.values()) {
    const sPos = nodePositions.get(item.m1);
    const tPos = nodePositions.get(item.m2);
    // Map edge routing only uses gridCoords for neighbor detection. gridCoords was the old
    // hardcoded grid; now we use mapCoords from the local-search result.
    const p1 = mapCoords.get(item.m1);
    const p2 = mapCoords.get(item.m2);
    if (!sPos || !tPos || !p1 || !p2) continue;

    const edgeId = `map_edge_${mapEdgeId++}`;
    const label = `x${item.count}`;
    const baseStyle = `html=1;strokeColor=${theme.relationships.interModule};strokeWidth=1.5;endArrow=classic;endSize=5;fontSize=11;fontColor=${theme.relationships.labelText};labelBackgroundColor=${theme.relationships.labelBg};labelBorderColor=${theme.relationships.labelBorder};`;

    let edgeStyle = "";
    let waypointsXml = "";

    const isHorizNeighbor = p1.r === p2.r && Math.abs(p1.c - p2.c) === 1;
    const isVertNeighbor = p1.c === p2.c && Math.abs(p1.r - p2.r) === 1;

    if (isHorizNeighbor) {
      if (p1.c < p2.c) {
        edgeStyle = `${baseStyle}edgeStyle=straight;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;`;
      } else {
        edgeStyle = `${baseStyle}edgeStyle=straight;exitX=0;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;`;
      }
    } else if (isVertNeighbor) {
      if (p1.r < p2.r) {
        edgeStyle = `${baseStyle}edgeStyle=straight;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;`;
      } else {
        edgeStyle = `${baseStyle}edgeStyle=straight;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;`;
      }
    } else {
      // Generic gutter routing based on relative grid positions only — no module names hardcoded.
      // Route above the upper node if target is in a different row, else through side gutter.
      const gutterY = p1.r < p2.r ? sPos.y + sPos.h + 20 : sPos.y - 20;
      const exitYf = p1.r < p2.r ? 1 : 0;
      const entryYf = p1.r < p2.r ? 0 : 1;

      edgeStyle = `${baseStyle}edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;exitX=0.5;exitY=${exitYf};exitDx=0;exitDy=0;entryX=0.5;entryY=${entryYf};entryDx=0;entryDy=0;`;
      waypointsXml = `          <mxGeometry relative="1" as="geometry">\n            <Array as="points">\n              <mxPoint x="${Math.round(sPos.x + sPos.w / 2)}" y="${gutterY}" />\n              <mxPoint x="${Math.round(tPos.x + tPos.w / 2)}" y="${gutterY}" />\n            </Array>\n          </mxGeometry>\n`;
    }

    if (!waypointsXml) {
      waypointsXml = `          <mxGeometry relative="1" as="geometry" />\n`;
    }

    xml += `        <mxCell id="${edgeId}" value="${escapeXml(label)}" style="${edgeStyle}" edge="1" parent="1" source="node_${item.m1}" target="node_${item.m2}">\n`;
    xml += waypointsXml;
    xml += `        </mxCell>\n`;
  }

  xml += `      </root>\n`;
  xml += `    </mxGraphModel>\n`;
  xml += `  </diagram>\n`;
  xml += `</mxfile>\n`;

  return xml;
}

function main() {
  if (process.env.ERD_KEEP_EXISTING === "1") {
    console.warn(
      "[ERD_KEEP_EXISTING=1] Per-module diagrams that already exist will NOT be regenerated.",
    );
  }
  console.log("Analyzing project schemas and models using ts-morph AST...");

  const project = new Project({
    tsConfigFilePath: path.resolve(__dirname, "../tsconfig.json"),
  });

  const modulesDir = getSchemaRoot();
  if (!fs.existsSync(modulesDir)) {
    console.error(`Modules directory not found at: ${modulesDir}`);
    process.exit(1);
  }

  // 1. Scan modules
  const subdirs = fs.readdirSync(modulesDir).filter((f) => {
    return fs.statSync(path.join(modulesDir, f)).isDirectory();
  });

  console.log(`Discovered ${subdirs.length} modules.`);

  const allSchemas: ExtractedSchema[] = [];
  const moduleMap = new Map<string, string[]>(); // Map module name to its model names

  for (const moduleName of subdirs) {
    const modulePath = path.join(modulesDir, moduleName);
    const sourceFiles = project.addSourceFilesAtPaths(
      path.join(modulePath, "**/*.ts"),
    );

    moduleMap.set(moduleName, []);

    for (const sourceFile of sourceFiles) {
      const fileSchemas = analyzeFile(sourceFile, moduleName);
      if (fileSchemas.length > 0) {
        allSchemas.push(...fileSchemas);
        for (const s of fileSchemas) {
          moduleMap.get(moduleName)!.push(s.name);
        }
      }
    }
  }

  // Build a map of all schemas by model name for easy lookup
  const allSchemasMap = new Map<string, ExtractedSchema>();
  for (const s of allSchemas) {
    allSchemasMap.set(s.name, s);
  }

  console.log(`Extracted ${allSchemas.length} models across modules.`);

  // Extract relationships from the query and aggregation code
  console.log(
    "Scanning service and controller source code for .populate() and $lookup relations...",
  );
  const codeRelations = extractRelationshipsFromCode(project, allSchemas);
  console.log(
    `Extracted ${codeRelations.length} relationships from codebase code parsing.`,
  );

  // 2. Generate ER diagrams for each module
  const outputDir = getOutputDir();

  // Clean up legacy .mmd files from previous configurations
  console.log("Cleaning up any old .mmd Mermaid diagrams...");
  deleteOldMmdFiles(outputDir);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let filesWritten = 0;
  const activeModuleNames = new Set(
    subdirs.filter((m) => allSchemas.some((s) => s.moduleName === m)),
  );

  for (const moduleName of subdirs) {
    const nativeSchemas = allSchemas.filter((s) => s.moduleName === moduleName);
    if (nativeSchemas.length === 0) {
      continue; // Skip modules without models
    }

    const moduleOutputDir = path.join(outputDir, moduleName);
    if (!fs.existsSync(moduleOutputDir)) {
      fs.mkdirSync(moduleOutputDir, { recursive: true });
    }

    if (nativeSchemas.length > 15) {
      console.log(
        `Module "${moduleName}" has ${nativeSchemas.length} entities (> 15). Splitting into sub-diagrams...`,
      );
      const partitions = partitionSchemas(nativeSchemas, codeRelations);

      // 1. Generate individual sub-diagrams
      for (let idx = 0; idx < partitions.length; idx++) {
        const subSchemas = partitions[idx];
        const partName = `${moduleName}-part${idx + 1}`;
        const subXml = buildDrawioDiagram(
          partName,
          subSchemas,
          allSchemasMap,
          moduleMap,
          codeRelations,
          false,
        );

        const valErr = validateDrawioXml(subXml, partName);
        if (valErr) {
          console.error(
            `[Validation Failed] Skipping sub-module part "${partName}": ${valErr}`,
          );
          continue;
        }

        const subOutputPath = path.join(moduleOutputDir, `${partName}.drawio`);
        safeWriteDrawioFile(subOutputPath, subXml);
        filesWritten++;
        console.log(
          `Generated sub-diagram: ${path.relative(process.cwd(), subOutputPath)}`,
        );
      }

      // 2. Generate overview diagram
      const overviewXml = buildOverviewDiagram(
        moduleName,
        partitions,
        codeRelations,
      );
      const valErr = validateDrawioXml(overviewXml, `${moduleName}-overview`);
      if (valErr) {
        console.error(
          `[Validation Failed] Skipping overview for "${moduleName}": ${valErr}`,
        );
      } else {
        const overviewPath = path.join(
          moduleOutputDir,
          `${moduleName}-overview.drawio`,
        );
        safeWriteDrawioFile(overviewPath, overviewXml);

        // Also write as er-diagram.drawio as the main entry point
        const standardPath = path.join(moduleOutputDir, "er-diagram.drawio");
        safeWriteDrawioFile(standardPath, overviewXml);
        filesWritten += 2;
        console.log(
          `Generated overview ER diagram at: ${path.relative(process.cwd(), overviewPath)}`,
        );
      }
    } else {
      // Standard single module diagram
      const xmlContent = buildDrawioDiagram(
        moduleName,
        nativeSchemas,
        allSchemasMap,
        moduleMap,
        codeRelations,
        false,
      );

      const validationError = validateDrawioXml(xmlContent, moduleName);
      if (validationError) {
        console.error(
          `[Validation Failed] Skipping module "${moduleName}": ${validationError}`,
        );
        continue;
      }

      const outputPath = path.join(moduleOutputDir, "er-diagram.drawio");
      safeWriteDrawioFile(outputPath, xmlContent);
      filesWritten++;
      console.log(
        `Generated ER diagram for module "${moduleName}" at: ${path.relative(process.cwd(), outputPath)}`,
      );
    }
  }

  // 3. Generate the project-wide (whole) ER diagram
  if (allSchemas.length > 0) {
    const wholeOutputDir = path.join(outputDir, "whole-er-diagram");
    const wholeXmlContent = buildWholeDiagram(
      allSchemas,
      allSchemasMap,
      moduleMap,
      codeRelations,
    );

    const validationError = validateDrawioXml(
      wholeXmlContent,
      "whole-er-diagram",
    );
    if (validationError) {
      console.error(
        `[Validation Failed] Skipping project-wide diagram: ${validationError}`,
      );
    } else {
      if (!fs.existsSync(wholeOutputDir)) {
        fs.mkdirSync(wholeOutputDir, { recursive: true });
      }
      const wholeOutputPath = path.join(wholeOutputDir, "er-diagram.drawio");
      fs.writeFileSync(wholeOutputPath, wholeXmlContent, "utf8");
      filesWritten++;
      console.log(
        `Generated project-wide ER diagram at: ${path.relative(process.cwd(), wholeOutputPath)}`,
      );
    }
  }

  // 4. Generate the module map diagram
  if (allSchemas.length > 0) {
    const moduleMapOutputDir = path.join(outputDir, "module-map");
    const moduleMapXmlContent = buildModuleMapDiagram(
      allSchemas,
      allSchemasMap,
      moduleMap,
      codeRelations,
    );

    const validationError = validateDrawioXml(
      moduleMapXmlContent,
      "module-map",
    );
    if (validationError) {
      console.error(
        `[Validation Failed] Skipping module-map diagram: ${validationError}`,
      );
    } else {
      if (!fs.existsSync(moduleMapOutputDir)) {
        fs.mkdirSync(moduleMapOutputDir, { recursive: true });
      }
      const moduleMapOutputPath = path.join(
        moduleMapOutputDir,
        "er-diagram.drawio",
      );
      fs.writeFileSync(moduleMapOutputPath, moduleMapXmlContent, "utf8");
      filesWritten++;
      console.log(
        `Generated module map diagram at: ${path.relative(process.cwd(), moduleMapOutputPath)}`,
      );
    }
  }

  // ─── Stale output report ────────────────────────────────────────────────────
  // List docs/erd/modules/<name>/ folders that no longer match a source module.
  const specialDirs = new Set(["whole-er-diagram", "module-map"]);
  let staleCount = 0;
  if (fs.existsSync(outputDir)) {
    const outDirs = fs.readdirSync(outputDir).filter((d) => {
      const fullPath = path.join(outputDir, d);
      return fs.statSync(fullPath).isDirectory() && !specialDirs.has(d);
    });
    const staleDirs = outDirs.filter((d) => !activeModuleNames.has(d));
    if (staleDirs.length > 0) {
      console.warn(
        `\n[Stale Output] The following ${staleDirs.length} module folder(s) in ${outputDir} no longer match a source module:`,
      );
      for (const d of staleDirs) {
        console.warn(`  - ${path.join(outputDir, d)}`);
      }
      if (process.env.ERD_PRUNE === "1") {
        console.warn("[ERD_PRUNE=1] Deleting stale module folders...");
        for (const d of staleDirs) {
          const dp = path.join(outputDir, d);
          fs.rmSync(dp, { recursive: true, force: true });
          console.warn(`  Deleted: ${dp}`);
        }
      } else {
        console.warn(
          "[Stale Output] Set ERD_PRUNE=1 to delete them automatically.",
        );
      }
      staleCount = staleDirs.length;
    } else {
      console.log("[Stale Output] No stale module folders found.");
    }
  }

  // ─── Final summary line ─────────────────────────────────────────────────────
  // Compute hub count and threshold from canonical rels (already logged above; re-read from env/config).
  const manualHubOverride = WHOLE_ERD_CONFIG.hubMinReferences;
  const hubRule =
    manualHubOverride > 0
      ? `ERD_HUB_MIN_REFS=${manualHubOverride}`
      : "adaptive (largest-gap >= 3 above floor=4, or mean+1.5σ)";
  const totalEntities = allSchemas.length;
  // Count canonical relationships from the whole-diagram pass (not re-computed here; approximate from schema scan)
  const totalSchemaRels = allSchemas.reduce((acc, s) => {
    return (
      acc +
      s.fields.filter((f) => f.ref || f.refPath).length +
      s.virtuals.filter((v) => v.ref).length
    );
  }, 0);
  const standaloneMods = subdirs.filter((m) => {
    return (
      activeModuleNames.has(m) &&
      !allSchemas.some(
        (s) =>
          s.moduleName === m &&
          allSchemas.some(
            (t) =>
              t.moduleName !== m &&
              (t.fields.some((f) => f.ref === s.name) ||
                s.fields.some((f) => f.ref === t.name)),
          ),
      )
    );
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `SUMMARY: modules=${activeModuleNames.size}, entities=${totalEntities}, schema-relationships=${totalSchemaRels}, hub-rule=[${hubRule}], standalone-modules≈${standaloneMods.length}, files-written=${filesWritten}, stale-folders=${staleCount}`,
  );
  console.log(`${"=".repeat(60)}\n`);

  console.log(
    "AST schema parsing and Draw.io XML diagram generation completed successfully.",
  );
}

if (require.main === module) {
  main();
}
