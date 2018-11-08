import * as vscode from 'vscode';
import {
  provideCompletionItems,
  resolveCompletionItem,
  ElmProjectManager,
  ElmCompletionItem,
} from 'elm-project-inspect'; // } from '../../elm-project-inspect/dist/index';

const globalProjectManager = new ElmProjectManager(([vscode.workspace.rootPath] || []));

export function getGlobalProjectManager(): ElmProjectManager {
  return globalProjectManager;
}

export class LocalCompletionItem extends vscode.CompletionItem {
  data: any;
}

const mapCompletionItem = (i: ElmCompletionItem): LocalCompletionItem => {
  const item = new LocalCompletionItem(i.label, vscode.CompletionItemKind.Class);
  item.data = i;
  return item;
};

export class ElmCompletionProvider implements vscode.CompletionItemProvider {
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[]> {
    const completionItems = await provideCompletionItems(
      getGlobalProjectManager(),
      document.fileName,
      document.offsetAt(position),
    );

    return completionItems.map(mapCompletionItem);
  }

  public async resolveCompletionItem(completionItem: vscode.CompletionItem): Promise<vscode.CompletionItem> {
    const elmCompletionItem = (completionItem as LocalCompletionItem).data;
    const resolved = await resolveCompletionItem(getGlobalProjectManager(), elmCompletionItem);

    completionItem.detail = resolved.detail;
    completionItem.documentation = resolved.documentation;

    return completionItem;
  }
}

const ELM_MODE: vscode.DocumentFilter = { language: 'elm', scheme: 'file' };

export function registerElmCompetionProviders(context: vscode.ExtensionContext) {
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    ELM_MODE,
    new ElmCompletionProvider(),
    '.',
  );

  vscode.workspace.onDidSaveTextDocument(d => {
    getGlobalProjectManager().invalidatePath(d.fileName);
  });

  context.subscriptions.push(completionProvider);
}
