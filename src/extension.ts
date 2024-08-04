import * as vscode from 'vscode';
import { parse as parseYaml } from 'yaml';
import Ajv, { ErrorObject, JSONSchemaType } from 'ajv';

const ajv = new Ajv()

export async function activate(context: vscode.ExtensionContext) {
	const collection = vscode.languages.createDiagnosticCollection('test');
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async (editor) => await changeDocListener(editor?.document)));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(async (event) => await changeDocListener(event.document, collection)));
}

interface PossibleYaml {
	jobs: {
		promote_version: {
			if: '${{ always() }}'
		}
	}
}

const possibleYamlSchema: JSONSchemaType<PossibleYaml> = {
	type: "object",
	properties: {
		jobs: {
			type: 'object',
			properties: {
				promote_version: {
					type: "object",
					properties: {
						if: { type: 'string', enum: ["${{ always() }}"] },
					},
					required: ['if'],
					additionalProperties: true
				}
			},
			required: ['promote_version'],
			additionalProperties: true
		},
	},
	required: ["jobs"],
	additionalProperties: true
}

const validate = ajv.compile(possibleYamlSchema)

async function changeDocListener(document?: vscode.TextDocument, collection?: vscode.DiagnosticCollection) {
	if (!document) return
	const docText = document.getText?.();
	const data: PossibleYaml = parseYaml(docText)
	const valid = validate(data)
	if (valid) {
		console.log('no problems detected; yaml good!');
		collection?.clear();
		return;
	}
	validate.errors?.map((error) => {
		const keyword = error.instancePath.split("/").pop()!
		const [line, startOfLine, eol] = findLinePosition(docText.split('\n'), keyword)!
		collection?.set(document.uri, [{
			code: '',
			message: `malformed YAML: ${error.message}: ${error.instancePath}`,
			range: new vscode.Range(new vscode.Position(line, startOfLine), new vscode.Position(line, eol)),
			severity: vscode.DiagnosticSeverity.Error,
			source: humanReadableError(error),
		}]);
	})
}

function humanReadableError(error: ErrorObject) {
	const params = error.params
	const paramErrors = []
	for (const k in error.params) {
		const error = params[k].toString()
		paramErrors.push(`${k}: ${error}`)
	}
	return `
		${error.instancePath}
		${error.message}
		${paramErrors.join('\n')}
	`
}

function findLinePosition(lines: string[], text: string) {
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
		const lineText = lines[lineNumber];
		if (lineText.match(new RegExp(`${text}`, 'gmi'))) {
			const whiteSpace = lineText.split(' ').filter((char) => char === '')
			return [
				lineNumber,
				whiteSpace.length,
				lineText.length - 1
			]
		}
	}
}
