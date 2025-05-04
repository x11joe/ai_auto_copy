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
// extension.ts
// Remember to always 'run npm run compile' after any changes to this file so that the changes are reflected in the compiled JavaScript file.
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class TreeNode extends vscode.TreeItem {
    label;
    uri;
    isFolder;
    constructor(label, uri, isFolder, collapsibleState = isFolder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None, command) {
        super(label, collapsibleState);
        this.label = label;
        this.uri = uri;
        this.isFolder = isFolder;
        this.resourceUri = uri;
        this.tooltip = uri.fsPath;
        this.checkboxState = isFolder || !command ? vscode.TreeItemCheckboxState.Unchecked : undefined;
        if (isFolder) {
            this.contextValue = 'folder';
        }
        else if (command) {
            if (command.command === 'aiFileCopier.loadPreset') {
                this.contextValue = 'loadPreset';
            }
            else if (command.command === 'aiFileCopier.savePreset') {
                this.contextValue = 'savePreset';
            }
            else {
                this.contextValue = 'presetAction';
            }
        }
        else {
            this.contextValue = 'file';
        }
        this.command = command;
    }
}
class FileSelectorProvider {
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    selectedFiles = new Set();
    context;
    outputChannel;
    constructor(context, outputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        // Optional debugging: Log the label and contextValue to verify they are set correctly
        console.log(`getTreeItem: label=${element.label}, contextValue=${element.contextValue}`);
        return element;
    }
    getChildren(element) {
        try {
            if (!element) {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    this.outputChannel.appendLine('No workspace folder open');
                    vscode.window.showWarningMessage('No workspace folder open. Please open a folder.');
                    return Promise.resolve([]);
                }
                const rootPath = workspaceFolders[0].uri.fsPath;
                const rootUri = vscode.Uri.file(rootPath);
                const presetNodes = this.getPresetNodes();
                const fileNodes = this.getFolderContents(rootPath);
                this.outputChannel.appendLine(`Root nodes being returned: savePreset='Save Preset', presetNodesCount=${presetNodes.length}, fileNodesCount=${fileNodes.length}`);
                return Promise.resolve([
                    new TreeNode('Save Preset', rootUri, false, vscode.TreeItemCollapsibleState.None, {
                        command: 'aiFileCopier.savePreset',
                        title: 'Save Preset'
                    }),
                    ...presetNodes,
                    ...fileNodes
                ]);
            }
            else if (element.isFolder) {
                return Promise.resolve(this.getFolderContents(element.uri.fsPath));
            }
            return Promise.resolve([]);
        }
        catch (error) {
            this.outputChannel.appendLine(`Error in getChildren: ${error}`);
            vscode.window.showErrorMessage(`Tree view error: ${error}`);
            return Promise.resolve([]);
        }
    }
    getPresetNodes() {
        const presetNames = this.getPresetNames();
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const rootUri = vscode.Uri.file(rootPath);
        return presetNames.map(name => new TreeNode(`Load: ${name}`, rootUri, false, vscode.TreeItemCollapsibleState.None, {
            command: 'aiFileCopier.loadPreset',
            title: `Load ${name}`,
            arguments: [name]
        }));
    }
    getFolderContents(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const nodes = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const uri = vscode.Uri.file(fullPath);
            if (entry.isDirectory()) {
                const node = new TreeNode(entry.name, uri, true);
                const filesInFolder = this.getAllFilesInFolder(fullPath);
                const allSelected = filesInFolder.length > 0 && filesInFolder.every(file => this.selectedFiles.has(file));
                node.checkboxState = allSelected ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
                nodes.push(node);
            }
            else if (entry.isFile()) {
                const node = new TreeNode(entry.name, uri, false);
                node.checkboxState = this.selectedFiles.has(fullPath) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
                nodes.push(node);
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
    savePreset(name) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const relativePaths = Array.from(this.selectedFiles).map(filePath => path.relative(workspaceRoot, filePath));
        const presets = this.context.workspaceState.get('presets', {});
        presets[name] = relativePaths;
        this.context.workspaceState.update('presets', presets);
        this.refresh();
    }
    loadPreset(name) {
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const presets = this.context.workspaceState.get('presets', {});
        const relativePaths = presets[name] || [];
        const absolutePaths = relativePaths.map(relPath => path.join(workspaceRoot, relPath)).filter(filePath => fs.existsSync(filePath));
        this.selectedFiles.clear();
        absolutePaths.forEach(filePath => this.selectedFiles.add(filePath));
        this.refresh();
    }
    getPresetNames() {
        const presets = this.context.workspaceState.get('presets', {});
        return Object.keys(presets);
    }
}
function getAncestorDirs(filePaths, workspaceRoot) {
    const ancestors = new Set();
    for (const filePath of filePaths) {
        let current = path.dirname(filePath);
        while (current.startsWith(workspaceRoot)) {
            ancestors.add(current);
            if (current === workspaceRoot)
                break;
            current = path.dirname(current);
        }
    }
    return ancestors;
}
function buildTreeString(currentDir, ancestorDirs, selectedFiles, prefix = '', isLast = true) {
    let result = '';
    if (!ancestorDirs.has(currentDir)) {
        return result;
    }
    const children = fs.readdirSync(currentDir, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const isLastChild = i === children.length - 1;
        const childPath = path.join(currentDir, child.name);
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        if (child.isDirectory()) {
            const displayName = `📁 ${child.name}/`;
            result += prefix + (isLastChild ? '└── ' : '├── ') + displayName + '\n';
            if (ancestorDirs.has(childPath)) {
                result += buildTreeString(childPath, ancestorDirs, selectedFiles, childPrefix, isLastChild);
            }
        }
        else if (child.isFile()) {
            const isSelected = selectedFiles.has(childPath);
            const displayName = `📄 ${child.name}${isSelected ? ' *' : ''}`;
            result += prefix + (isLastChild ? '└── ' : '├── ') + displayName + '\n';
        }
    }
    return result;
}
function activate(context) {
    try {
        const outputChannel = vscode.window.createOutputChannel('AI File Copier');
        outputChannel.appendLine('AI File Copier extension activated');
        vscode.window.showInformationMessage('AI File Copier extension activated');
        const fileSelectorProvider = new FileSelectorProvider(context, outputChannel);
        const treeView = vscode.window.createTreeView('aiFileSelector', {
            treeDataProvider: fileSelectorProvider,
            showCollapseAll: true
        });
        treeView.onDidChangeCheckboxState(event => {
            for (const [item, state] of event.items) {
                fileSelectorProvider.updateSelectedFiles(item, state);
            }
        });
        context.subscriptions.push(treeView.onDidChangeVisibility(() => {
            if (treeView.visible) {
                fileSelectorProvider.refresh();
            }
        }));
        const copyCommand = vscode.commands.registerCommand('aiFileCopier.copySelectedFiles', async () => {
            const selectedFiles = fileSelectorProvider.getSelectedFiles();
            if (selectedFiles.size === 0) {
                vscode.window.showInformationMessage('No files selected to copy.');
                return;
            }
            const existingSelectedFiles = Array.from(selectedFiles).filter(filePath => fs.existsSync(filePath));
            if (existingSelectedFiles.length === 0) {
                vscode.window.showInformationMessage('No existing files selected to copy.');
                return;
            }
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const ancestorDirs = getAncestorDirs(new Set(existingSelectedFiles), workspaceRoot);
            const treeString = buildTreeString(workspaceRoot, ancestorDirs, new Set(existingSelectedFiles));
            const directoryStructure = `Directory Structure:\n${treeString}\n`;
            const fileContents = [];
            for (const filePath of existingSelectedFiles) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const relativePath = path.relative(workspaceRoot, filePath);
                    fileContents.push(`${relativePath}:\n${content}\n`);
                }
                catch (err) {
                    vscode.window.showErrorMessage(`Failed to read ${filePath}: ${err}`);
                }
            }
            const SEPARATOR = '\n-------------------\n-------------------\n';
            const fileContentsText = fileContents.join(SEPARATOR);
            const finalText = directoryStructure + 'File Contents:\n' + fileContentsText;
            await vscode.env.clipboard.writeText(finalText);
            vscode.window.showInformationMessage(`${existingSelectedFiles.length} file(s) copied to clipboard!`);
        });
        const savePresetCommand = vscode.commands.registerCommand('aiFileCopier.savePreset', async () => {
            const name = await vscode.window.showInputBox({ prompt: 'Enter a name for the preset' });
            if (name) {
                fileSelectorProvider.savePreset(name);
                vscode.window.showInformationMessage(`Preset "${name}" saved.`);
            }
        });
        const loadPresetCommand = vscode.commands.registerCommand('aiFileCopier.loadPreset', async (presetName) => {
            const name = presetName || await vscode.window.showQuickPick(fileSelectorProvider.getPresetNames(), { placeHolder: 'Select a preset to load' });
            if (name) {
                fileSelectorProvider.loadPreset(name);
                vscode.window.showInformationMessage(`Preset "${name}" loaded.`);
            }
        });
        const removePresetCommand = vscode.commands.registerCommand('aiFileCopier.removePreset', async (node) => {
            if (node.contextValue === 'loadPreset' && node.command && node.command.arguments && node.command.arguments.length > 0) {
                const presetName = node.command.arguments[0];
                const confirmation = await vscode.window.showWarningMessage(`Are you sure you want to remove preset "${presetName}"?`, 'Yes', 'No');
                if (confirmation === 'Yes') {
                    const presets = context.workspaceState.get('presets', {});
                    if (presets[presetName]) {
                        delete presets[presetName];
                        await context.workspaceState.update('presets', presets);
                        fileSelectorProvider.refresh();
                        vscode.window.showInformationMessage(`Preset "${presetName}" removed.`);
                    }
                    else {
                        vscode.window.showWarningMessage(`Preset "${presetName}" not found.`);
                    }
                }
            }
            else {
                vscode.window.showErrorMessage('Invalid preset node.');
            }
        });
        context.subscriptions.push(copyCommand, savePresetCommand, loadPresetCommand, removePresetCommand);
        context.subscriptions.push(vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh()));
    }
    catch (error) {
        console.error('Error activating AI File Copier extension:', error);
        vscode.window.showErrorMessage(`Failed to activate AI File Copier: ${error}`);
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map