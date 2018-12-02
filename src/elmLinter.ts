import * as cp from 'child_process';
import * as readline from 'readline';
import * as path from 'path';
import * as utils from './elmUtils';
import * as vscode from 'vscode';
import * as elmTest from './elmTest';
import * as _ from 'lodash';
import { ElmAnalyse } from './elmAnalyse';

export interface IElmIssueRegion {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface IElmIssue {
  tag: string;
  overview: string;
  subregion: string;
  details: string;
  region: IElmIssueRegion;
  type: string;
  file: string;
}

function severityStringToDiagnosticSeverity(
  severity: string,
): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Error;
  }
}

function elmMakeIssueToDiagnostic(issue: IElmIssue): vscode.Diagnostic {
  let lineRange: vscode.Range = new vscode.Range(
    issue.region.start.line - 1,
    issue.region.start.column - 1,
    issue.region.end.line - 1,
    issue.region.end.column - 1,
  );
  return new vscode.Diagnostic(
    lineRange,
    issue.overview + ' - ' + issue.details.replace(/\[\d+m/g, ''),
    severityStringToDiagnosticSeverity(issue.type),
  );
}

function parseErrorsElm019(line) {
  const returnLines = [];
  const errorObject = JSON.parse(line);

  if (errorObject.type === 'compile-errors') {
    errorObject.errors.forEach(error => {
      const problems = error.problems.map(problem => ({
        tag: 'error',
        overview: problem.title,
        subregion: '',
        details: problem.message
          .map(
            message =>
              typeof message === 'string'
                ? message
                : '#' + message.string + '#',
          )
          .join(''),
        region: problem.region,
        type: 'error',
        file: error.path,
      }));

      returnLines.push(...problems);
    });
  } else if (errorObject.type === 'error') {
    const problem = {
      tag: 'error',
      overview: errorObject.title,
      subregion: '',
      details: errorObject.message
        .map(
          message => (typeof message === 'string' ? message : message.string),
        )
        .join(''),
      region: {
        start: {
          line: 1,
          column: 1,
        },
        end: {
          line: 1,
          column: 1,
        },
      },
      type: 'error',
      file: errorObject.path,
    };

    returnLines.push(problem);
  }

  return returnLines;
}

function parseErrorsElm018(line) {
  if (line.startsWith('Successfully generated')) {
    // ignore compiler successes
    return [];
  }
  // elm make returns an array of issues
  return <IElmIssue[]>JSON.parse(line);
}

function checkForErrors(filename): Promise<IElmIssue[]> {
  return new Promise((resolve, reject) => {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(
      'elm',
    );
    const make018Command: string = <string>config.get('makeCommand');
    const compiler: string = <string>config.get('compiler');
    const elmTestCompiler: string = <string>config.get('elmTestCompiler');
    const [cwd, elmVersion] = utils.detectProjectRootAndElmVersion(
      filename,
      vscode.workspace.rootPath,
    );
    const isTestFile = elmTest.fileIsTestFile(filename);
    let make;

    if (utils.isWindows) {
      filename = '"' + filename + '"';
    }



    const args018 = [filename, '--report', 'json', '--output', '/dev/null'];
    const args019 = [
      'make',
      filename,
      '--report',
      'json',
      '--output',
      '/dev/null',
    ];
    const args = utils.isElm019(elmVersion) ? args019 : args018;
    const makeCommand = utils.isElm019(elmVersion)
      ? isTestFile
        ? elmTestCompiler
        : compiler
      : make018Command;

    if (utils.isWindows) {
      make = cp.exec(makeCommand + ' ' + args.join(' '), { cwd: cwd });
    } else {
      make = cp.spawn(makeCommand, args, { cwd: cwd });
    }
    // output is actually optional
    // (fixed in https://github.com/Microsoft/vscode/commit/b4917afe9bdee0e9e67f4094e764f6a72a997c70,
    // but unreleased at this time)
    const errorLinesFromElmMake = readline.createInterface({
      // elm 0.19 uses stderr, elm 0.18 uses stdout
      input: utils.isElm019(elmVersion) ? make.stderr : make.stdout,
      output: undefined,
    });

    const lines = [];

    const elm018stderr: Buffer[] = [];

    errorLinesFromElmMake.on('line', line => {
      if (utils.isElm019(elmVersion)) {
        const newLines = parseErrorsElm019(line);
        newLines.forEach(l => lines.push(l));
      } else {
        const newLines = parseErrorsElm018(line);
        newLines.forEach(l => lines.push(l));
      }
    });

    if (utils.isElm019(elmVersion) === false) {
      // we listen to stderr for Elm 0.18
      // as this is where a whole file issue would go
      make.stderr.on('data', (data: Buffer) => {
        if (data) {
          elm018stderr.push(data);
        }
      });
    }

    make.on('error', err => {
      errorLinesFromElmMake.close();
      if (err && err.code === 'ENOENT') {
        vscode.window.showInformationMessage(
          `The elm compiler is not available (${makeCommand}). Install Elm from https://elm-lang.org.`,
        );
        resolve([]);
      } else {
        reject(err);
      }
    });

    make.on('close', (code, signal) => {
      errorLinesFromElmMake.close();

      if (elm018stderr.length) {
        let errorResult: IElmIssue = {
          tag: 'error',
          overview: '',
          subregion: '',
          details: elm018stderr.join(''),
          region: {
            start: {
              line: 1,
              column: 1,
            },
            end: {
              line: 1,
              column: 1,
            },
          },
          type: 'error',
          file: filename,
        };
        resolve([errorResult]);
      } else {
        resolve(lines);
      }
    });
  });
}

let compileErrors: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('elm-make-diagnostics');
let elmAnalyseErrors: vscode.DiagnosticCollection = vscode.languages.createDiagnosticCollection('elm-analyse-diagnostics');

export async function runLinter(
  document: vscode.TextDocument,
  elmAnalyse: ElmAnalyse,
): Promise<void> {
  if (document.languageId !== 'elm' || document.uri.scheme !== 'file') {
    return;
  }

  const uri: vscode.Uri = document.uri;
  const cwd: string = utils.detectProjectRoot(uri.fsPath) || vscode.workspace.rootPath;

  // elm make stops reporting when it has reached an unknown state (probably to void reporting cascading errors).
  // This means that we will not receive all errors on each elm make invocation.
  //
  // The options for diagnostics reporting:
  //
  // A) Clear all errors and display only what elm make reports. (current solution)
  // B) Keep all set of errors around until the file with an error has changed.
  //    This would require user going to every file that reported an error and saving it to clear errors.
  //    After saving, the error that WAS in the file will no longer be reported if elm make exited on a different
  //    error even if the error situation still exists.
  // C) Determine which files were included in an elm make call and if the type of error reported form elm make is
  //    a type error then clear all parse errors. If it's a parse error leave type errors because we don't know if they have been remedied.
  //
  // Best solution is probably a combination of B and C

  elmAnalyseErrors.set(uri, undefined);
  compileErrors.set(uri, undefined);

  const elmAnalyseByFile = _.groupBy(elmAnalyse.elmAnalyseIssues, i => i.file);

  _.forOwn(elmAnalyseByFile, (issues, file) => {
    elmAnalyseErrors.set(vscode.Uri.file(file), issues.map(i => elmMakeIssueToDiagnostic(i)));
  });

  const compilerErrors: IElmIssue[] = await checkForErrors(uri.fsPath);
  const elmCompileByFile = _.groupBy(compilerErrors, issue => {
    if (issue.file.startsWith('.')) {
      return cwd + issue.file.slice(1);
    } else {
      return issue.file;
    }
  });

  _.forOwn(elmCompileByFile, (issues, file) => {
    compileErrors.set(
      vscode.Uri.file(file),
      issues.map(error => elmMakeIssueToDiagnostic(error)),
    );
  });
}
