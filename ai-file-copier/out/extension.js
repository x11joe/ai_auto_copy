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
// Represents a node in the tree view (file or folder)
class TreeNode extends vscode.TreeItem {
    label;
    uri;
    isFolder;
    constructor(label, uri, isFolder) {
        super(label, isFolder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.uri = uri;
        this.isFolder = isFolder;
        this.resourceUri = uri;
        this.tooltip = uri.fsPath;
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        this.contextValue = isFolder ? 'folder' : 'file';
    }
}
// Manages the tree view and selected files
class FileSelectorProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    selectedFiles = new Set();
    constructor() { }
    refresh() {
        this.selectedFiles.clear();
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return Promise.resolve([]);
            }
            const rootPath = workspaceFolders[0].uri.fsPath;
            return Promise.resolve(this.getFolderContents(rootPath));
        }
        else if (element.isFolder) {
            return Promise.resolve(this.getFolderContents(element.uri.fsPath));
        }
        return Promise.resolve([]);
    }
    getFolderContents(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const nodes = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const uri = vscode.Uri.file(fullPath);
            if (entry.isDirectory()) {
                nodes.push(new TreeNode(entry.name, uri, true));
            }
            else if (entry.isFile()) {
                nodes.push(new TreeNode(entry.name, uri, false));
            }
        }
        return nodes;
    }
    getAllFilesInFolder(dir) {
        const files = [];
        const readDirRecursive = (currentDir) => {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isFile()) {
                    files.push(fullPath);
                }
                else if (entry.isDirectory()) {
                    readDirRecursive(fullPath);
                }
            }
        };
        readDirRecursive(dir);
        return files;
    }
    updateSelectedFiles(item, state) {
        if (item.isFolder) {
            const filesInFolder = this.getAllFilesInFolder(item.uri.fsPath);
            if (state === vscode.TreeItemCheckboxState.Checked) {
                filesInFolder.forEach(filePath => this.selectedFiles.add(filePath));
            }
            else {
                filesInFolder.forEach(filePath => this.selectedFiles.delete(filePath));
            }
        }
        else {
            if (state === vscode.TreeItemCheckboxState.Checked) {
                this.selectedFiles.add(item.uri.fsPath);
            }
            else {
                this.selectedFiles.delete(item.uri.fsPath);
            }
        }
    }
    getSelectedFiles() {
        return this.selectedFiles;
    }
}
// Main activation function
function activate(context) {
    const fileSelectorProvider = new FileSelectorProvider();
    // Create the tree view with checkboxes and collapse all option
    const treeView = vscode.window.createTreeView('aiFileSelector', {
        treeDataProvider: fileSelectorProvider,
        showCollapseAll: true
    });
    // Handle checkbox state changes
    treeView.onDidChangeCheckboxState(event => {
        for (const [item, state] of event.items) {
            fileSelectorProvider.updateSelectedFiles(item, state);
        }
    });
    // Register the copy command
    const copyCommand = vscode.commands.registerCommand('aiFileCopier.copySelectedFiles', async () => {
        const selectedFiles = fileSelectorProvider.getSelectedFiles();
        if (selectedFiles.size === 0) {
            vscode.window.showInformationMessage('No files selected to copy.');
            return;
        }
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const fileContents = [];
        for (const filePath of selectedFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const relativePath = path.relative(workspaceRoot, filePath);
                fileContents.push(`${relativePath}:\n${content}\n`);
            }
            catch (err) {
                vscode.window.showErrorMessage(`Failed to read ${filePath}: ${err}`);
            }
        }
        // Define the new separator
        const SEPARATOR = '\n-------------------\n-------------------\n';
        const finalText = fileContents.join(SEPARATOR);
        await vscode.env.clipboard.writeText(finalText);
        vscode.window.showInformationMessage(`${selectedFiles.size} file(s) copied to clipboard!`);
    });
    context.subscriptions.push(copyCommand);
    context.subscriptions.push(vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh()));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map