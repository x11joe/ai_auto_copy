import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Represents a node in the tree view (file or folder)
class TreeNode extends vscode.TreeItem {
    public readonly isFolder: boolean;

    constructor(
        public readonly label: string,
        public readonly uri: vscode.Uri,
        isFolder: boolean
    ) {
        super(label, isFolder ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.isFolder = isFolder;
        this.resourceUri = uri;
        this.tooltip = uri.fsPath;
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked;
        this.contextValue = isFolder ? 'folder' : 'file';
    }
}

// Manages the tree view and selected files
class FileSelectorProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private selectedFiles = new Set<string>();

    constructor() {}

    refresh(): void {
        this.selectedFiles.clear();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return Promise.resolve([]);
            }
            const rootPath = workspaceFolders[0].uri.fsPath;
            return Promise.resolve(this.getFolderContents(rootPath));
        } else if (element.isFolder) {
            return Promise.resolve(this.getFolderContents(element.uri.fsPath));
        }
        return Promise.resolve([]);
    }

    private getFolderContents(dir: string): TreeNode[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const nodes: TreeNode[] = [];
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const uri = vscode.Uri.file(fullPath);
            if (entry.isDirectory()) {
                nodes.push(new TreeNode(entry.name, uri, true));
            } else if (entry.isFile()) {
                nodes.push(new TreeNode(entry.name, uri, false));
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
}

// Helper function to get all ancestor directories of selected files
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

// Helper function to build the directory structure string
function buildTreeString(currentDir: string, ancestorDirs: Set<string>, selectedFiles: Set<string>, prefix: string = '', isLast: boolean = true): string {
    let result = '';
    // Only process directories that are ancestors of selected files
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
            // Only recurse if this directory is an ancestor (contains selected files or leads to them)
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

// Main activation function
export function activate(context: vscode.ExtensionContext) {
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

        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

        // Compute ancestor directories for selected files
        const ancestorDirs = getAncestorDirs(selectedFiles, workspaceRoot);

        // Build the directory structure tree string
        const treeString = buildTreeString(workspaceRoot, ancestorDirs, selectedFiles);
        const directoryStructure = `Directory Structure:\n${treeString}\n`;

        // Collect file contents
        const fileContents: string[] = [];
        for (const filePath of selectedFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const relativePath = path.relative(workspaceRoot, filePath);
                fileContents.push(`${relativePath}:\n${content}\n`);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to read ${filePath}: ${err}`);
            }
        }

        // Define the separator
        const SEPARATOR = '\n-------------------\n-------------------\n';

        // Combine directory structure and file contents
        const fileContentsText = fileContents.join(SEPARATOR);
        const finalText = directoryStructure + 'File Contents:\n' + fileContentsText;

        // Copy to clipboard
        await vscode.env.clipboard.writeText(finalText);
        vscode.window.showInformationMessage(`${selectedFiles.size} file(s) copied to clipboard!`);
    });

    context.subscriptions.push(copyCommand);

    context.subscriptions.push(
        vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh())
    );
}

export function deactivate() {}