import * as vscode from 'vscode';

import { ElmCodeActionProvider, activateCodeActions } from './elmCodeAction';
import { ElmFormatProvider } from './elmFormat';
import { ElmRangeFormatProvider } from './elmFormat';
import { activateReactor, deactivateReactor } from './elmReactor';

import { ElmCompletionProvider, registerElmCompetionProviders } from './elmAutocomplete';
import { runLinter, IElmIssue } from './elmLinter';
import { activateRepl } from './elmRepl';
import { activateMake } from './elmMake';
// import {activateMakeWarn} from './elmMakeWarn';
import { activatePackage } from './elmPackage';
import { activateClean } from './elmClean';
import { ElmAnalyse } from './elmAnalyse';
import { ElmDefinitionProvider } from './elmDefinition';
import { ElmHoverProvider } from './elmInfo';
import { ElmSymbolProvider } from './elmSymbol';
import { ElmWorkspaceSymbolProvider } from './elmWorkspaceSymbols';
import { configuration } from './elmConfiguration';
import { getGlobalModuleResolver } from './elmModuleResolver';
import { activateUnusedImportsDiagnostics } from './elmUnusedImports';

const ELM_MODE: vscode.DocumentFilter = { language: 'elm', scheme: 'file' };
const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('elm');
const disableLinter: boolean = <boolean>config.get('disableLinting');
const elmAnalyseIssues: IElmIssue[] = [];
const elmAnalyse = new ElmAnalyse(elmAnalyseIssues);
// this method is called when your extension is activated
export function activate(ctx: vscode.ExtensionContext) {
  const elmFormatStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );

  vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
    if (
      document === vscode.window.activeTextEditor.document &&
      document.languageId === ELM_MODE.language &&
      document.uri.scheme === ELM_MODE.scheme
    ) {
      getGlobalModuleResolver().invalidatePath(document.fileName);
      workspaceProvider.update(document);
    }
  });

  if (!disableLinter) {
    ctx.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
        runLinter(document, elmAnalyse);
      }),
    );
  }

  activateUnusedImportsDiagnostics();

  activateRepl().forEach((d: vscode.Disposable) => ctx.subscriptions.push(d));
  activateReactor().forEach((d: vscode.Disposable) =>
    ctx.subscriptions.push(d),
  );
  activateMake().forEach((d: vscode.Disposable) => ctx.subscriptions.push(d));
  activatePackage().forEach((d: vscode.Disposable) =>
    ctx.subscriptions.push(d),
  );
  activateClean().forEach((d: vscode.Disposable) => ctx.subscriptions.push(d));
  activateCodeActions().forEach((d: vscode.Disposable) =>
    ctx.subscriptions.push(d),
  );
  elmAnalyse
    .activateAnalyse()
    .forEach((d: vscode.Disposable) => ctx.subscriptions.push(d));

  let workspaceProvider = new ElmWorkspaceSymbolProvider(ELM_MODE);

  ctx.subscriptions.push(
    vscode.languages.setLanguageConfiguration('elm', configuration),
  );
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider(ELM_MODE, new ElmHoverProvider()),
  );

  registerElmCompetionProviders(ctx);

  ctx.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      ELM_MODE,
      new ElmSymbolProvider(),
    ),
  );
  ctx.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      ELM_MODE,
      new ElmDefinitionProvider(ELM_MODE, workspaceProvider),
    ),
  );
  ctx.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ELM_MODE,
      new ElmCodeActionProvider(),
    ),
  );
  ctx.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      ELM_MODE,
      new ElmFormatProvider(elmFormatStatusBar),
    ),
  );
  ctx.subscriptions.push(
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      ELM_MODE,
      new ElmRangeFormatProvider(elmFormatStatusBar),
    ),
  );
  ctx.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider(workspaceProvider),
  );
}

export function deactivate() {
  deactivateReactor();
  elmAnalyse.deactivateAnalyse();
}
