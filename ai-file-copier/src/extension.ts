//extension.ts
//npm run compile  <-- Remember to run AFTER making changes to this file
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

class TreeNode extends vscode.TreeItem {
    public readonly isFolder: boolean;

    constructor(
        public readonly label: string,
        public readonly uri: vscode.Uri,
        isFolder: boolean,
        collapsibleState: vscode.TreeItemCollapsibleState = isFolder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.isFolder = isFolder;
        this.resourceUri = uri;
        this.tooltip = uri.fsPath;
        this.checkboxState = isFolder || !command ? vscode.TreeItemCheckboxState.Unchecked : undefined;
        this.contextValue = isFolder ? 'folder' : (command ? 'presetAction' : 'file');
        this.command = command;
    }
}

class FileSelectorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles = new Set<string>();
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
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
            } else if (element.isFolder) {
                return Promise.resolve(this.getFolderContents(element.uri.fsPath));
            }
            return Promise.resolve([]);
        } catch (error) {
            this.outputChannel.appendLine(`Error in getChildren: ${error}`);
            vscode.window.showErrorMessage(`Tree view error: ${error}`);
            return Promise.resolve([]);
        }
    }

    private getPresetNodes(): TreeNode[] {
        const presetNames = this.getPresetNames();
        const rootPath = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const rootUri = vscode.Uri.file(rootPath);
        return presetNames.map(name => 
            new TreeNode(`Load: ${name}`, rootUri, false, vscode.TreeItemCollapsibleState.None, {
                command: 'aiFileCopier.loadPreset',
                title: `Load ${name}`,
                arguments: [name]
            })
        );
    }

    private getFolderContents(dir: string): TreeNode[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const nodes: TreeNode[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const uri = vscode.Uri.file(fullPath);
            if (entry.isDirectory()) {
                const node = new TreeNode(entry.name, uri, true);
                const filesInFolder = this.getAllFilesInFolder(fullPath);
                const allSelected = filesInFolder.length > 0 && filesInFolder.every(file => this.selectedFiles.has(file));
                node.checkboxState = allSelected ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
                nodes.push(node);
            } else if (entry.isFile()) {
                const node = new TreeNode(entry.name, uri, false);
                node.checkboxState = this.selectedFiles.has(fullPath) ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
                nodes.push(node);
            }
        }
        return nodes;
    }

    private getAllFilesInFolder(dir: string): string[] {
        const files: string[] = [];
        const readDirRecursive = (currentDir: string) => {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isFile()) {
                    files.push(fullPath);
                } else if (entry.isDirectory()) {
                    readDirRecursive(fullPath);
                }
            }
        };
        readDirRecursive(dir);
        return files;
    }

    public updateSelectedFiles(item: TreeNode, state: vscode.TreeItemCheckboxState) {
        if (item.isFolder) {
            const filesInFolder = this.getAllFilesInFolder(item.uri.fsPath);
            if (state === vscode.TreeItemCheckboxState.Checked) {
                filesInFolder.forEach(filePath => this.selectedFiles.add(filePath));
            } else {
                filesInFolder.forEach(filePath => this.selectedFiles.delete(filePath));
            }
        } else {
            if (state === vscode.TreeItemCheckboxState.Checked) {
                this.selectedFiles.add(item.uri.fsPath);
            } else {
                this.selectedFiles.delete(item.uri.fsPath);
            }
        }
    }

    public getSelectedFiles(): Set<string> {
        return this.selectedFiles;
    }

    public savePreset(name: string) {
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const relativePaths = Array.from(this.selectedFiles).map(filePath => path.relative(workspaceRoot, filePath));
        const presets = this.context.workspaceState.get('presets', {}) as Record<string, string[]>;
        presets[name] = relativePaths;
        this.context.workspaceState.update('presets', presets);
        this.refresh();
    }

    public loadPreset(name: string) {
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        const presets = this.context.workspaceState.get('presets', {}) as Record<string, string[]>;
        const relativePaths = presets[name] || [];
        const absolutePaths = relativePaths.map(relPath => path.join(workspaceRoot, relPath)).filter(filePath => fs.existsSync(filePath));
        this.selectedFiles.clear();
        absolutePaths.forEach(filePath => this.selectedFiles.add(filePath));
        this.refresh();
    }

    public getPresetNames(): string[] {
        const presets = this.context.workspaceState.get('presets', {}) as Record<string, string[]>;
        return Object.keys(presets);
    }
}

function getAncestorDirs(filePaths: Set<string>, workspaceRoot: string): Set<string> {
    const ancestors = new Set<string>();
    for (const filePath of filePaths) {
        let current = path.dirname(filePath);
        while (current.startsWith(workspaceRoot)) {
            ancestors.add(current);
            if (current === workspaceRoot) break;
            current = path.dirname(current);
        }
    }
    return ancestors;
}

function buildTreeString(currentDir: string, ancestorDirs: Set<string>, selectedFiles: Set<string>, prefix: string = '', isLast: boolean = true): string {
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
        } else if (child.isFile()) {
            const isSelected = selectedFiles.has(childPath);
            const displayName = `📄 ${child.name}${isSelected ? ' *' : ''}`;
            result += prefix + (isLastChild ? '└── ' : '├── ') + displayName + '\n';
        }
    }
    return result;
}

export function activate(context: vscode.ExtensionContext) {
    try {
        // Create output channel inside activate
        const outputChannel = vscode.window.createOutputChannel('AI File Copier');
        outputChannel.appendLine('AI File Copier extension activated');

        // Show a notification to confirm activation
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

        context.subscriptions.push(
            treeView.onDidChangeVisibility(() => {
                if (treeView.visible) {
                    fileSelectorProvider.refresh();
                }
            })
        );

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

            const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
            const ancestorDirs = getAncestorDirs(new Set(existingSelectedFiles), workspaceRoot);
            const treeString = buildTreeString(workspaceRoot, ancestorDirs, new Set(existingSelectedFiles));
            const directoryStructure = `Directory Structure:\n${treeString}\n`;

            const fileContents: string[] = [];
            for (const filePath of existingSelectedFiles) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const relativePath = path.relative(workspaceRoot, filePath);
                    fileContents.push(`${relativePath}:\n${content}\n`);
                } catch (err) {
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

        const loadPresetCommand = vscode.commands.registerCommand('aiFileCopier.loadPreset', async (presetName?: string) => {
            const name = presetName || await vscode.window.showQuickPick(fileSelectorProvider.getPresetNames(), { placeHolder: 'Select a preset to load' });
            if (name) {
                fileSelectorProvider.loadPreset(name);
                vscode.window.showInformationMessage(`Preset "${name}" loaded.`);
            }
        });

        context.subscriptions.push(copyCommand, savePresetCommand, loadPresetCommand);

        context.subscriptions.push(
            vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh())
        );
    } catch (error) {
        console.error('Error activating AI File Copier extension:', error);
        vscode.window.showErrorMessage(`Failed to activate AI File Copier: ${error}`);
    }
}

export function deactivate() {}