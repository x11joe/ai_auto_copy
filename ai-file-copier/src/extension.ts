import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Represents a file in the custom view
class FileItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly uri: vscode.Uri,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = this.uri.fsPath;
        this.checkboxState = vscode.TreeItemCheckboxState.Unchecked; // Default unchecked
        this.contextValue = 'fileItem';
    }
}

// Manages the tree view and file list
class FileSelectorProvider implements vscode.TreeDataProvider<FileItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private files: FileItem[] = [];

    constructor() {
        this.refresh();
    }

    refresh(): void {
        this.files = this.getWorkspaceFiles();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: FileItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: FileItem): Thenable<FileItem[]> {
        if (element) {
            return Promise.resolve([]); // No nested items
        }
        return Promise.resolve(this.files);
    }

    private getWorkspaceFiles(): FileItem[] {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        const files: FileItem[] = [];
        const rootPath = workspaceFolders[0].uri.fsPath;

        const readDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile()) {
                    files.push(new FileItem(
                        entry.name,
                        vscode.Uri.file(fullPath),
                        vscode.TreeItemCollapsibleState.None
                    ));
                } else if (entry.isDirectory()) {
                    readDir(fullPath); // Recursively read subdirectories
                }
            }
        };

        readDir(rootPath);
        return files;
    }

    getSelectedFiles(): FileItem[] {
        return this.files.filter(file => file.checkboxState === vscode.TreeItemCheckboxState.Checked);
    }
}

// Main activation function
export function activate(context: vscode.ExtensionContext) {
    const fileSelectorProvider = new FileSelectorProvider();
    vscode.window.registerTreeDataProvider('aiFileSelector', fileSelectorProvider);

    const copyCommand = vscode.commands.registerCommand('aiFileCopier.copySelectedFiles', async () => {
        const selectedFiles = fileSelectorProvider.getSelectedFiles();
        if (selectedFiles.length === 0) {
            vscode.window.showInformationMessage('No files selected to copy.');
            return;
        }

        const fileContents: string[] = [];
        for (const file of selectedFiles) {
            try {
                const content = fs.readFileSync(file.uri.fsPath, 'utf8');
                fileContents.push(`${file.label}:\n${content}\n`);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to read ${file.label}: ${err}`);
            }
        }

        const finalText = fileContents.join('\n---\n');
        await vscode.env.clipboard.writeText(finalText);
        vscode.window.showInformationMessage(`${selectedFiles.length} file(s) copied to clipboard!`);
    });

    context.subscriptions.push(copyCommand);

    context.subscriptions.push(
        vscode.commands.registerCommand('aiFileSelector.refresh', () => fileSelectorProvider.refresh())
    );
}

export function deactivate() {}