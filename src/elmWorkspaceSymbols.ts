import * as vscode from 'vscode';

import { TextDocument, SymbolInformation } from 'vscode';
import { processDocument } from './elmSymbol';

const config = vscode.workspace.getConfiguration('elm');

export class ElmWorkspaceSymbolProvider
  implements vscode.WorkspaceSymbolProvider {
  private symbolsByContainer: { [key: string]: vscode.SymbolInformation[] };
  private symbolsByUri: { [uri: string]: vscode.SymbolInformation[] };
  private symbolsByName: { [symbolName: string]: vscode.SymbolInformation[] };
  private workspaceIndexTime: Date;

  public constructor(private languagemode: vscode.DocumentFilter) {
    this.symbolsByContainer = {};
    this.symbolsByUri = {};
    this.symbolsByName = {};
  }

  public async update(document: TextDocument) {
    await this.indexDocument(document);
  }

  public async provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken,
  ): Promise<vscode.SymbolInformation[]> {
    const [sourceModule, symbolName] = query.split(':', 2);

    if (symbolName == null) {
      return this.searchWorkspaceSymbols(sourceModule);
    }

    return this.searchModuleSymbols(sourceModule, symbolName);
  }

  private async searchWorkspaceSymbols(
    symbol: string,
  ): Promise<SymbolInformation[]> {
    if (this.workspaceIndexTime == null) {
      await this.indexWorkspace();
    }

    const matchingSymbols: SymbolInformation[] = Object.keys(
      this.symbolsByName,
    ).reduce((acc: SymbolInformation[], k: string) => {
      if (k.startsWith(symbol)) {
        return acc.concat(this.symbolsByName[k]);
      } else {
        return acc;
      }
    }, []);

    return matchingSymbols;
  }

  private async searchModuleSymbols(
    moduleName: string,
    symbol: string,
  ): Promise<SymbolInformation[]> {
    const containerSymbols = this.symbolsByContainer[moduleName];

    if (containerSymbols == null) {
      await this.indexModule(moduleName);
    }

    return (this.symbolsByContainer[moduleName] || []).filter(
      s => s.name === symbol,
    );
  }

  private async indexWorkspace() {
    const maxFiles = config['maxWorkspaceFilesUsedBySymbols'];
    const excludePattern = config['workspaceFilesExcludePatternUsedBySymbols'];
    const workspaceFiles = await vscode.workspace.findFiles(
      '**/*.elm',
      excludePattern,
      maxFiles,
    );

    try {
      await Promise.all(
        workspaceFiles.map(async uri =>
          this.indexDocument(await vscode.workspace.openTextDocument(uri)),
        ),
      );

      this.workspaceIndexTime = new Date();
    } catch (error) {
      return;
    }
  }

  private async indexModule(moduleName: string): Promise<void> {
    const modulePath = moduleName.replace(/\./g, '/') + '.elm';
    const matchedFiles = await vscode.workspace.findFiles(
      '**/*/' + modulePath,
      null,
      1,
    );

    if (matchedFiles.length === 1) {
      await this.indexDocument(
        await vscode.workspace.openTextDocument(matchedFiles[0]),
      );
    }
  }

  private async indexDocument(document: TextDocument) {
    const updatedSymbols = await processDocument(document);

    updatedSymbols.forEach(s => {
      this.symbolsByContainer[s.containerName] = (
        this.symbolsByContainer[s.containerName] || []
      ).concat(s);
      this.symbolsByUri[s.location.uri.toString()] = (
        this.symbolsByContainer[s.location.uri.toString()] || []
      ).concat(s);
      this.symbolsByName[s.name] = (this.symbolsByName[s.name] || []).concat(s);
    });
  }
}
