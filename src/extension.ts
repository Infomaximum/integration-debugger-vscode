import * as vscode from "vscode";
import {
  EntityDebugCodeLensProvider,
  type DebugParams,
} from "./EntityDebugCodeLensProvider";
import type { Debugging } from "@infomaximum/integration-sdk";

export function activate(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("integration-debugger");
  const isEnabledExt = config.get<boolean>("debugConfigurationName", false);

  if (!isEnabledExt) {
    return;
  }

  const runDebugCommandName = "integration-debugger.runDebugEntity";

  const codeLensProvider = new EntityDebugCodeLensProvider({
    runDebugCommandName,
  });

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "typescript" },
      codeLensProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      runDebugCommandName,
      async (params: DebugParams) => {
        const config = vscode.workspace.getConfiguration(
          "integration-debugger"
        );
        const debugConfigName = config.get<string>("debugConfigurationName");

        if (!debugConfigName) {
          vscode.window.showErrorMessage(
            "Debug configuration not specified in settings"
          );

          return;
        }

        const debugConfig = await getDebugConfiguration(debugConfigName);

        if (!debugConfig) {
          vscode.window.showErrorMessage(
            `Debug configuration "${debugConfigName}" not found`
          );
          return;
        }

        const finalConfig = mergeArgs(debugConfig, {
          series: !params.series ? undefined : true,
          entityKey: params.entityKey,
          isGenerateSchema: params.isGenerateSchema ? true : undefined,
        } satisfies Debugging.DebugIntegrationOptions);

        vscode.debug.startDebugging(undefined, finalConfig);
      }
    )
  );
}

async function getDebugConfiguration(
  name: string
): Promise<vscode.DebugConfiguration | undefined> {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders) {
    return undefined;
  }

  const { configurations } = vscode.workspace.getConfiguration(
    "launch",
    folders[0].uri
  );

  return configurations.find((c: any) => c.name === name);
}

function mergeArgs(
  config: vscode.DebugConfiguration,
  additionArgs: Record<string, string | boolean | undefined>
): vscode.DebugConfiguration {
  const args = Object.entries(additionArgs)
    .map(([key, value]) => {
      let str = `--${key}`;

      if (value === true) {
        return str;
      }

      if (value === undefined) {
        return undefined;
      }

      return `${str}=${value}`;
    })
    .filter(Boolean);

  if (Array.isArray(config?.args)) {
    return { ...config, args: [...config.args, ...args] };
  }

  return { ...config, args: { ...config.args, ...args } };
}

export function deactivate() {}
