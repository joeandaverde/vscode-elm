import * as vscode from 'vscode';

import { SymbolInformation, TextDocument } from 'vscode';
import { getGlobalModuleResolver } from './elmModuleResolver';

export class ElmSymbolProvider implements vscode.DocumentSymbolProvider {
  public async provideDocumentSymbols(doc: TextDocument, _) {
    return extractDocumentSymbols(doc);
  }
}

export async function extractDocumentSymbols(
  doc: TextDocument,
): Promise<vscode.SymbolInformation[]> {
  try {
    const parsedModule = await getGlobalModuleResolver().moduleFromPath(
      doc.fileName,
    );

    if (parsedModule == null) {
      return [];
    }

    const moduleTypes = parsedModule.types
      .map(t => {
        if (t.type === 'custom-type') {
          const constructorDefn = new SymbolInformation(
            t.name,
            vscode.SymbolKind.Class,
            parsedModule.name,
            new vscode.Location(
              doc.uri,
              doc.positionAt(t.location.start.offset),
            ),
          );

          return t.constructors
            .map(ctor => {
              return new SymbolInformation(
                ctor.name,
                vscode.SymbolKind.Class,
                parsedModule.name,
                new vscode.Location(
                  doc.uri,
                  doc.positionAt(ctor.location.start.offset),
                ),
              );
            })
            .concat(constructorDefn);
        } else if (t.type === 'type-alias') {
          const typeAliasSymbol = new SymbolInformation(
            t.name,
            vscode.SymbolKind.Class,
            parsedModule.name,
            new vscode.Location(
              doc.uri,
              doc.positionAt(t.location.start.offset),
            ),
          );

          return [typeAliasSymbol];
        } else {
          const _exhaustiveCheck: never = t;
          return [];
        }
      })
      .reduce(
        (
          acc: SymbolInformation[],
          c: SymbolInformation[],
        ): SymbolInformation[] => acc.concat(c),
        [],
      );

    const moduleFunctions = parsedModule.function_declarations.map(f => {
      return new SymbolInformation(
        f.name,
        vscode.SymbolKind.Function,
        parsedModule.name,
        new vscode.Location(doc.uri, doc.positionAt(f.location.start.offset)),
      );
    });

    const moduleDefn = new SymbolInformation(
      parsedModule.name,
      vscode.SymbolKind.Module,
      parsedModule.name,
      new vscode.Location(
        doc.uri,
        doc.positionAt(parsedModule.location.start.offset),
      ),
    );

    const allSymbols = moduleTypes.concat(moduleFunctions).concat(moduleDefn);

    return allSymbols;
  } catch (error) {
    return [];
  }
}
