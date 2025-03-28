"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Represents a file in the custom view
class FileItem extends vscode.TreeItem {
    label;
    uri;
    collapsibleState;
    constructor(label, uri, collapsibleState) {
        super(label, collapsibleState);
        this.label = label;
        this.uri = uri;
        this.collapsibleState = collapsibleState;
        this.tooltip = this.uri.fsPath;
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked; // Default unchecked
        this.contextValue = 'fileItem';
    }
}
// Manages the tree view and file list
class FileSelectorProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    files = [];
    constructor() {
        this.refresh();
    }
    refresh() {
        this.files = this.getWorkspaceFiles();
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]); // No nested items
        }
        return Promise.resolve(this.files);
    }
    getWorkspaceFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }
        const files = [];
        const rootPath = workspaceFolders[0].uri.fsPath;
        const readDir = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile()) {
                    files.push(new FileItem(entry.name, vscode.Uri.file(fullPath), vscode.TreeItemCollapsibleState.None));
                }
                else if (entry.isDirectory()) {
                    readDir(fullPath); // Recursively read subdirectories
                }
            }
        };
        readDir(rootPath);
        return files;
    }
    getSelectedFiles() {
        return this.files.filter(file => file.checkboxState === vscode.TreeItemCheckboxState.Checked);
    }
}
// Main activation function
function activate(context) {
    const fileSelectorProvider = new FileSelectorProvider();
    vscode.window.registerTreeDataProvider('aiFileSelector', fileSelectorProvider);
    const copyCommand = vscode.commands.registerCommand('aiFileCopier.copySelectedFiles', async () => {
        const selectedFiles = fileSelectorProvider.getSelectedFiles();
        if (selectedFiles.length === 0) {
            vscode.window.showInformationMessage('No files selected to copy.');
            return;
        }
        const fileContents = [];
        for (const file of selectedFiles) {
            try {
                const content = fs.readFileSync(file.uri.fsPath, 'utf8');
                fileContents.push(`${file.label}:\n${content}\n`);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to read ${file.label}: ${err}`);
            }
        }
        const finalText = fileContents.join('\n---\n');
        await vscode.env.clipboard.writeText(finalText);
        vscode.window.showInformationMessage(`${selectedFiles.length} file(s) copied to clipboard!`);
    });
    context.subscriptions.push(copyCommand);
    context.subscriptions.push(vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh()));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map