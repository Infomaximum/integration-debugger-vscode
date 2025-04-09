import { parse } from "@babel/parser";
import type { Node, NodePath } from "@babel/traverse";
import traverse from "@babel/traverse";
import { Debugging } from "@infomaximum/integration-sdk";
import {
  isArrowFunctionExpression,
  isFunctionExpression,
  type Identifier,
  type ObjectMethod,
  type ObjectProperty,
} from "@babel/types";
import * as vscode from "vscode";

export type DebugParams = Debugging.DebugIntegrationOptions;

export type EntityDebugCodeLensProviderParams = {
  runDebugCommandName: string;
};

export type FunctionNamesConfig = {
  single: string[];
  series: string[];
};

export class EntityDebugCodeLensProvider implements vscode.CodeLensProvider {
  private runDebugCommandName: string;
  private config = vscode.workspace.getConfiguration("integration-debugger");

  constructor({ runDebugCommandName }: EntityDebugCodeLensProviderParams) {
    this.runDebugCommandName = runDebugCommandName;
  }

  public provideCodeLenses(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const functionNames =
      this.config.get<FunctionNamesConfig>("functionNames")!;

    return this.findDebugEntities(document, functionNames);
  }

  private getCodeLenses(
    path: NodePath<ObjectMethod | ObjectProperty>,
    isSeries: boolean
  ) {
    const codeLenses: vscode.CodeLens[] = [];
    const entityKey = this.findEntityKey(path);

    if (!entityKey) {
      return null;
    }

    const startLine = path.node.loc?.start.line;
    if (startLine === undefined) {
      return null;
    }

    const range = new vscode.Range(startLine - 1, 0, startLine - 1, 0);

    const params = {
      entityKey,
    } satisfies DebugParams;

    codeLenses.push(
      new vscode.CodeLens(range, {
        title: `$(debug-alt) Debug`,
        tooltip: `Perform a single debug run of the "${entityKey}" block`,
        command: this.runDebugCommandName,
        arguments: [params],
      })
    );

    if (isSeries) {
      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `$(debug-alt) Debug series`,
          tooltip: `Perform a series of debugging operations on the "${entityKey}" block`,
          command: this.runDebugCommandName,
          arguments: [{ ...params, series: true } satisfies DebugParams],
        })
      );

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: `$(lightbulb) Generate schema`,
          tooltip: `Generate a scheme based on the output data of block "${entityKey}"`,
          command: this.runDebugCommandName,
          arguments: [
            { ...params, isGenerateSchema: true } satisfies DebugParams,
          ],
        })
      );
    }

    return codeLenses;
  }

  private findDebugEntities(
    document: vscode.TextDocument,
    functionNames: FunctionNamesConfig
  ): vscode.CodeLens[] {
    const codeLenses: vscode.CodeLens[] = [];
    const text = document.getText();

    try {
      const ast = parse(text, {
        sourceType: "module",
        plugins: ["typescript"],
        ranges: true,
      });

      traverse(ast, {
        ObjectMethod: (path) => {
          const key = (path.node.key as Identifier)?.name;

          const isSingle = functionNames.single.includes(key);
          const isSeries = functionNames.series.includes(key);

          if (!key || !(isSingle || isSeries)) {
            return;
          }

          const codeLens = this.getCodeLenses(path, isSeries);

          codeLens && codeLenses.push(...codeLens);
        },
        ObjectProperty: (path) => {
          const key = (path.node.key as Identifier)?.name;
          const isSingle = functionNames.single.includes(key);
          const isSeries = functionNames.series.includes(key);

          if (!key || !(isSingle || isSeries)) {
            return;
          }

          const isFunction =
            isFunctionExpression(path.node.value) ||
            isArrowFunctionExpression(path.node.value);

          if (!isFunction && !path.node.value?.type.endsWith("Function")) {
            return;
          }

          const codeLense = this.getCodeLenses(path, isSeries);

          codeLense && codeLenses.push(...codeLense);
        },
      });
    } catch (error) {
      console.error("AST parsing error:", error);
    }

    return codeLenses;
  }

  private findEntityKey(
    path: NodePath<ObjectProperty | ObjectMethod>
  ): string | null {
    let parent = path.parentPath as NodePath<Node> | null;

    while (parent) {
      if (parent.isObjectExpression()) {
        const metaProp = parent.node.properties.find(
          (p: any) => p.key?.name === "meta"
        );

        if (metaProp) {
          const keyProp = (metaProp as any)?.value?.properties?.find(
            (p: any) => p.key?.name === "key"
          );

          if (keyProp?.value?.value) {
            return keyProp.value.value;
          }
        }
      }

      parent = parent.parentPath;
    }

    return null;
  }
}
