/** A minimal subset of JSON Schema (draft-7) we translate to Dart. */
export interface JsonSchemaLike {
  type?: string | string[];
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
}

const PRIMITIVES = new Set(["String", "int", "double", "bool", "dynamic"]);

/**
 * Emit a Dart class (plus nested classes) for an object JSON schema. Returns the
 * full Dart source for `rootName` and every nested class it references.
 */
export function jsonSchemaToDart(rootName: string, schema: JsonSchemaLike): string {
  const classes: string[] = [];
  emitClass(rootName, schema, classes);
  return classes.join("\n\n");
}

function emitClass(name: string, schema: JsonSchemaLike, out: string[]): void {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(props).map(([key, propSchema]) => ({
    key,
    schema: propSchema,
    optional: !required.has(key),
    type: dartType(name, key, propSchema, out),
  }));

  const decls = fields.map((f) => `  final ${f.type}${f.optional ? "?" : ""} ${f.key};`).join("\n");
  const ctorParams = fields.map((f) => `${f.optional ? "" : "required "}this.${f.key}`).join(", ");
  const fromJson = fields
    .map((f) => `        ${f.key}: ${fromJsonExpr(`j['${f.key}']`, f.type, f.optional, f.schema)},`)
    .join("\n");
  const toJson = fields
    .map((f) => `        '${f.key}': ${toJsonExpr(f.key, f.type, f.optional)},`)
    .join("\n");

  out.push(
    `class ${name} {
${decls}

  ${name}({${ctorParams}});

  factory ${name}.fromJson(Map<String, dynamic> j) => ${name}(
${fromJson}
      );

  Map<String, dynamic> toJson() => {
${toJson}
      };
}`,
  );
}

function dartType(parent: string, key: string, schema: JsonSchemaLike, out: string[]): string {
  switch (typeOf(schema)) {
    case "object": {
      const className = parent + pascal(key);
      emitClass(className, schema, out);
      return className;
    }
    case "array":
      return `List<${dartType(parent, `${key}Item`, schema.items ?? {}, out)}>`;
    case "string":
      return "String";
    case "integer":
      return "int";
    case "number":
      return "double";
    case "boolean":
      return "bool";
    default:
      return "dynamic";
  }
}

function fromJsonExpr(
  access: string,
  type: string,
  optional: boolean,
  schema: JsonSchemaLike,
): string {
  const conv = convExpr(access, type, schema);
  return optional ? `${access} == null ? null : ${conv}` : conv;
}

function convExpr(access: string, type: string, schema: JsonSchemaLike): string {
  if (type.startsWith("List<")) {
    const inner = type.slice(5, -1);
    return `(${access} as List).map((e) => ${convExpr("e", inner, schema.items ?? {})}).toList()`;
  }
  switch (type) {
    case "String":
      return `${access} as String`;
    case "int":
      return `(${access} as num).toInt()`;
    case "double":
      return `(${access} as num).toDouble()`;
    case "bool":
      return `${access} as bool`;
    case "dynamic":
      return access;
    default:
      return `${type}.fromJson(${access} as Map<String, dynamic>)`;
  }
}

function toJsonExpr(field: string, type: string, optional: boolean): string {
  const q = optional ? "?" : "";
  if (type.startsWith("List<")) {
    const inner = type.slice(5, -1);
    return isCustom(inner) ? `${field}${q}.map((e) => e.toJson()).toList()` : field;
  }
  return isCustom(type) ? `${field}${q}.toJson()` : field;
}

function isCustom(type: string): boolean {
  return !PRIMITIVES.has(type) && !type.startsWith("List<");
}

function typeOf(schema: JsonSchemaLike): string {
  const t = schema.type;
  if (Array.isArray(t)) return t.find((x) => x !== "null") ?? "dynamic";
  return t ?? "dynamic";
}

function pascal(key: string): string {
  return key
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}
