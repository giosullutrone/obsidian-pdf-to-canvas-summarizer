import {
    App,
    Plugin,
    PluginSettingTab,
    Setting,
    Notice,
    TFile,
    TFolder,
} from 'obsidian';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * Interface for plugin settings.
 */
interface PDFSummarizerPluginSettings {
    vllmApiUrl: string;           // URL of the vLLM API server
    debugMode: boolean;           // Enable or disable debug mode for verbose logging
    model: string;                // The model to use for vLLM API
    systemPrompt: string;         // The system prompt for the assistant
    maxTokens: number;            // Maximum number of tokens for the model
    apiToken: string;             // API token for authentication

    // Model parameters
    temperature: number;          // Temperature for sampling
    top_k: number;                // Top-k sampling
    top_p: number;                // Top-p (nucleus) sampling
    repeat_penalty: number;       // Repeat penalty
    presence_penalty: number;     // Presence penalty
    frequency_penalty: number;    // Frequency penalty

    // Plugin-specific settings
    inputFolder: string;          // Input folder containing PDFs
    outputFolder: string;         // Output folder for canvases

    // Custom Prompts
    summarizationPrompt: string;  // Template for summarization prompt
    categorizationPrompt: string; // Template for categorization prompt
    titlePrompt: string; // Template for title prompt
}

/** Default settings */
const DEFAULT_SETTINGS: PDFSummarizerPluginSettings = {
    vllmApiUrl: 'http://localhost:11434',
    debugMode: false,
    model: 'llama3.2:latest',
    systemPrompt: 'You are a helpful assistant.',
    maxTokens: 2048,
    apiToken: '',

    // Default model parameters
    temperature: 0.8,
    top_k: 20,
    top_p: 0.9,
    repeat_penalty: 1.2,
    presence_penalty: 1.5,
    frequency_penalty: 1.0,

    // Plugin-specific settings
    inputFolder: '',
    outputFolder: '',

    // Default Prompts
    summarizationPrompt: `Research Paper:
{doc}

As an expert research paper summarizer, create a clear and concise summary of the provided scientific article following these guidelines:
- Start with the title of the paper in bold.
- Then structure the summary with the following sections:
  1. What problem does it solve?
  2. How does it solve the problem?
  3. What are the implications?
  4. What's next?
- Each section should be 3-5 sentences long.
- Use plain language and explain technical terms when necessary.
- Focus on the most important and novel aspects of the research.
- Use markdown for formatting:
  - Use **bold** for the title and section headers
  - Use bullet points for lists if needed

Provide your summary in the following format:

**[Title of the Paper]**

**What problem does it solve?**
[Your summary for this section]

**How does it solve the problem?**
[Your summary for this section]

**What are the implications?**
[Your summary for this section]

**What's next?**
[Your summary for this section]

Provide ONLY the summary text, nothing else.
Summary:`,

    categorizationPrompt: `Summary:
{summary}

Based on the summary of the provided research paper about Large Language Models (LLMs), determine the most appropriate category for filing purposes. Choose a concise (1-3 words) but descriptive category name. The category should be generic enough to group similar LLM-related papers together. Create categories based on the ideas and not the applications.

Existing categories: {existing_subjects}

If a suitable category already exists in the list above, use that. Otherwise, suggest a new category.

Respond ONLY with the category name suggested or selected, nothing else.

Category:`,
    
    titlePrompt: `Research Paper:
{doc}

Extract the title from the provided research paper. The title is the main heading of the document and is usually at the beginning. It is often in a larger font size or bolded. Don't include the name of the authors.
Answer ONLY with the title of the research paper, nothing else.
Title:`,
};


/*######################################################
# Plugin Setting Tab
######################################################*/

/**
 * Class representing the plugin's settings tab.
 */
class PDFSummarizerPluginSettingTab extends PluginSettingTab {
    plugin: PDFSummarizerPlugin;

    constructor(app: App, plugin: PDFSummarizerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Display the settings tab in the plugin settings.
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'PDF Summarizer Plugin Settings' });

        // vLLM API URL Setting
        new Setting(containerEl)
            .setName('vLLM API URL')
            .setDesc('Enter the URL of your vLLM server (e.g., http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.vllmApiUrl)
                .onChange(async (value) => {
                    this.plugin.settings.vllmApiUrl = value;
                    await this.plugin.saveSettings();
                })
            );

        // Model Setting
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Specify the model to use for the vLLM API (e.g., llama3.2)')
            .addText(text => text
                .setPlaceholder('llama3.2')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                })
            );

        // System Prompt Setting
        new Setting(containerEl)
            .setName('System Prompt')
            .setDesc('Set the system prompt for the assistant')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant.')
                .setValue(this.plugin.settings.systemPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.systemPrompt = value;
                    await this.plugin.saveSettings();
                })
            );

        // Max Tokens Setting
        new Setting(containerEl)
            .setName('Max Tokens')
            .setDesc('Set the maximum number of tokens for the model')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '1';
                text.setPlaceholder('2048')
                    .setValue(this.plugin.settings.maxTokens.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num) && num > 0) {
                            this.plugin.settings.maxTokens = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid positive number for max tokens.');
                        }
                    });
            });

        // API Token Setting
        new Setting(containerEl)
            .setName('API Token')
            .setDesc('Enter your API token if required (e.g., for closed models)')
            .addText(text => text
                .setPlaceholder('Your API token')
                .setValue(this.plugin.settings.apiToken)
                .onChange(async (value) => {
                    this.plugin.settings.apiToken = value;
                    await this.plugin.saveSettings();
                })
            );

        // Debug Mode Setting
        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable or disable debug mode for verbose logging')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debugMode)
                .onChange(async (value) => {
                    this.plugin.settings.debugMode = value;
                    await this.plugin.saveSettings();
                })
            );

        // Input Folder Setting
        new Setting(containerEl)
            .setName('Input Folder')
            .setDesc('Specify the input folder containing PDF files')
            .addText(text => text
                .setPlaceholder('Enter input folder path')
                .setValue(this.plugin.settings.inputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.inputFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        // Output Folder Setting
        new Setting(containerEl)
            .setName('Output Folder')
            .setDesc('Specify the output folder for the canvases')
            .addText(text => text
                .setPlaceholder('Enter output folder path')
                .setValue(this.plugin.settings.outputFolder)
                .onChange(async (value) => {
                    this.plugin.settings.outputFolder = value;
                    await this.plugin.saveSettings();
                })
            );

        // Add a heading for Model Parameters
        containerEl.createEl('h3', { text: 'Model Parameters' });

        // Temperature Setting
        new Setting(containerEl)
            .setName('Temperature')
            .setDesc('Set the temperature for sampling (e.g., 0.8)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.1';
                text.setPlaceholder('0.8')
                    .setValue(this.plugin.settings.temperature.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= 0) {
                            this.plugin.settings.temperature = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid non-negative number for temperature.');
                        }
                    });
            });

        // Top K Setting
        new Setting(containerEl)
            .setName('Top K')
            .setDesc('Set the top-k value for sampling (e.g., 20)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.setPlaceholder('20')
                    .setValue(this.plugin.settings.top_k.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num) && num >= 0) {
                            this.plugin.settings.top_k = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid non-negative integer for top_k.');
                        }
                    });
            });

        // Top P Setting
        new Setting(containerEl)
            .setName('Top P')
            .setDesc('Set the top-p (nucleus) value for sampling (e.g., 0.9)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.1';
                text.setPlaceholder('0.9')
                    .setValue(this.plugin.settings.top_p.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= 0 && num <= 1) {
                            this.plugin.settings.top_p = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid number between 0 and 1 for top_p.');
                        }
                    });
            });

        // Repeat Penalty Setting
        new Setting(containerEl)
            .setName('Repeat Penalty')
            .setDesc('Set the repeat penalty (e.g., 1.2)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.1';
                text.setPlaceholder('1.2')
                    .setValue(this.plugin.settings.repeat_penalty.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= 0) {
                            this.plugin.settings.repeat_penalty = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid non-negative number for repeat penalty.');
                        }
                    });
            });

        // Presence Penalty Setting
        new Setting(containerEl)
            .setName('Presence Penalty')
            .setDesc('Set the presence penalty (e.g., 1.5)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.1';
                text.setPlaceholder('1.5')
                    .setValue(this.plugin.settings.presence_penalty.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.presence_penalty = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid number for presence penalty.');
                        }
                    });
            });

        // Frequency Penalty Setting
        new Setting(containerEl)
            .setName('Frequency Penalty')
            .setDesc('Set the frequency penalty (e.g., 1.0)')
            .addText(text => {
                text.inputEl.type = 'number';
                text.inputEl.step = '0.1';
                text.setPlaceholder('1.0')
                    .setValue(this.plugin.settings.frequency_penalty.toString())
                    .onChange(async (value) => {
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.frequency_penalty = num;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice('Please enter a valid number for frequency penalty.');
                        }
                    });
            });

        // Add a heading for Custom Prompts
        containerEl.createEl('h3', { text: 'Custom Prompts' });

        // Summarization Prompt Setting
        new Setting(containerEl)
            .setName('Summarization Prompt')
            .setDesc('Customize the prompt used for summarizing PDFs. You can use {doc} as a placeholder for the document text.')
            .addTextArea(text => text
                .setPlaceholder('Enter your summarization prompt here...')
                .setValue(this.plugin.settings.summarizationPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.summarizationPrompt = value;
                    await this.plugin.saveSettings();
                })
            );

        // Categorization Prompt Setting
        new Setting(containerEl)
            .setName('Categorization Prompt')
            .setDesc('Customize the prompt used for categorizing summaries. You can use {summary} and {existing_subjects} as placeholders.')
            .addTextArea(text => text
                .setPlaceholder('Enter your categorization prompt here...')
                .setValue(this.plugin.settings.categorizationPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.categorizationPrompt = value;
                    await this.plugin.saveSettings();
                })
            );

        // Title Prompt Setting
        new Setting(containerEl)
            .setName('Title Prompt')
            .setDesc('Customize the prompt used for extracting the title. You can use {doc} as a placeholder for the document text.')
            .addTextArea(text => text
                .setPlaceholder('Enter your title prompt here...')
                .setValue(this.plugin.settings.titlePrompt)
                .onChange(async (value) => {
                    this.plugin.settings.titlePrompt = value;
                    await this.plugin.saveSettings();
                })
            );
    }
}

/*######################################################
# Main Plugin Class
######################################################*/

/**
 * Main class for the PDF Summarizer Plugin.
 */
export default class PDFSummarizerPlugin extends Plugin {
    settings: PDFSummarizerPluginSettings;

    async onload() {
        console.log('Loading PDF Summarizer Plugin');
        await this.loadSettings();
        this.addSettingTab(new PDFSummarizerPluginSettingTab(this.app, this));

        // Add command to start summarization of PDFs
        this.addCommand({
            id: 'summarize-pdfs',
            name: 'Summarize PDFs in Input Folder',
            callback: () => this.handleSummarization(),
        });
    }

    async onunload() {
        console.log('Unloading PDF Summarizer Plugin');
    }

    /**
     * Load settings from disk.
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * Save settings to disk.
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }

    /*######################################################
    # Summarization Methods
    ######################################################*/

    async handleSummarization() {
        // Get input and output folder paths
        const inputFolderPath = this.settings.inputFolder;
        const outputFolderPath = this.settings.outputFolder;

        if (!inputFolderPath || !outputFolderPath) {
            new Notice('Please specify both input and output folders in the plugin settings.');
            return;
        }

        // Get PDFs in input folder and subfolders
        const pdfFiles = this.getPDFFilesInFolder(inputFolderPath);

        if (pdfFiles.length === 0) {
            new Notice('No PDF files found in the input folder.');
            return;
        }

        // Process each PDF
        for (const pdfFile of pdfFiles) {
            try {
                await this.processPDFFile(pdfFile, outputFolderPath);
            } catch (error) {
                new Notice(`Error processing ${pdfFile.path}: ${error.message}`);
                if (this.settings.debugMode) {
                    console.error(`Error processing ${pdfFile.path}:`, error);
                }
            }
        }

        new Notice('Summarization completed.');
    }

    getPDFFilesInFolder(folderPath: string): TFile[] {
        const allFiles = this.app.vault.getFiles();
        const pdfFiles = allFiles.filter(file =>
            file.extension.toLowerCase() === 'pdf' &&
            file.path.startsWith(folderPath)
        );
        return pdfFiles;
    }

    async processPDFFile(pdfFile: TFile, outputFolderPath: string): Promise<void> {
        // Extract text from PDF
        const text = await this.extractTextFromPDF(pdfFile);

        // Remove references/bibliography
        const textWithoutReferences = this.removeReferences(text);

        // Check text length
        const maxTokens = this.settings.maxTokens;
        const maxCharacters = maxTokens * 3.6;
        if (textWithoutReferences.length > maxCharacters) {
            new Notice(`Text of ${pdfFile.path} exceeds the maximum context length. Proceeding with the summarization.`);
        }

        // Use LLM to extract title
        const title = await this.extractTitleFromText(textWithoutReferences);

        // Sanitize the title to create a valid file name
        const sanitizedTitle = this.sanitizeFileName(title);

        // Use LLM to generate summary
        const summary = await this.generateSummary(textWithoutReferences);

        // Use LLM to determine subfolder using both title and summary
        const subfolder = await this.determineSubfolder(sanitizedTitle, summary, outputFolderPath);

        // Create canvas and add nodes
        await this.createCanvasWithNodes(sanitizedTitle, pdfFile, summary, subfolder);

        if (this.settings.debugMode) {
            console.log(`Processed ${pdfFile.path} and created canvas.`);
        }
    }

    /**
     * Sanitize the file name by removing invalid characters and ensuring it ends with .canvas
     * @param name The original file name
     * @returns The sanitized file name
     */
    sanitizeFileName(name: string): string {
        // Replace invalid characters with underscores
        const invalidChars = /[\/\\?%*:|"<>]/g;
        let sanitized = name.replace(invalidChars, '_').trim();

        // Replace spaces with underscores
        sanitized = sanitized.replace(/\s+/g, '_');

        // Ensure the file name ends with .canvas
        if (!sanitized.toLowerCase().endsWith('.canvas')) {
            sanitized += '.canvas';
        }

        return sanitized;
    }

    /**
     * Sanitize the folder name by removing invalid characters
     * @param name The original folder name
     * @returns The sanitized folder name
     */
    sanitizeFolderName(name: string): string {
        // Replace invalid characters with underscores
        const invalidChars = /[\/\\?%*:|"<>]/g;
        let sanitized = name.replace(invalidChars, '_').trim();

        // Replace spaces with underscores
        sanitized = sanitized.replace(/\s+/g, '_');

        return sanitized;
    }

    async extractTextFromPDF(pdfFile: TFile): Promise<string> {
        // Read the PDF file as an ArrayBuffer
        const arrayBuffer = await this.app.vault.readBinary(pdfFile);

        // Configure pdfjs
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';

        // Load the PDF using pdfjs
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;

        let textContent = '';

        // Loop through each page
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) => item.str);
            textContent += strings.join(' ') + '\n\n';
        }

        return textContent;
    }

    removeReferences(text: string): string {
        // Split text at common reference section headings
        const regex = /(References|Bibliography|Acknowledgments|Acknowledgements|Notes|REFERENCES|BIBLIOGRAPHY|ACKNOWLEDGMENTS|ACKNOWLEDGEMENTS|NOTES)/i;
        const parts = text.split(regex);
        if (parts.length > 1) {
            // Return text before the references section
            return parts[0];
        } else {
            return text;
        }
    }

    async extractTitleFromText(text: string): Promise<string> {
        const promptTemplate = this.settings.titlePrompt;
        const prompt = promptTemplate
            .replace("{doc}", text.slice(0, 500));

        const messages = [
            { role: 'system', content: this.settings.systemPrompt },
            { role: 'user', content: prompt },
        ];

        const title = await this.callVLLMAPI(messages);
        return title.trim();
    }

    async generateSummary(text: string): Promise<string> {
        const promptTemplate = this.settings.summarizationPrompt;
        const prompt = promptTemplate.replace("{doc}", text);

        const messages = [
            { role: 'system', content: this.settings.systemPrompt },
            { role: 'user', content: prompt },
        ];

        const summary = await this.callVLLMAPI(messages);
        return summary.trim();
    }

    /**
     * Determine the subfolder (category) using both title and summary
     * @param title The sanitized title of the paper
     * @param summary The summary of the paper
     * @param outputFolderPath The path to the output folder
     * @returns The path to the determined (and sanitized) subfolder
     */
    async determineSubfolder(title: string, summary: string, outputFolderPath: string): Promise<string> {
        // Get existing subfolders in outputFolderPath
        const outputFolder = this.app.vault.getAbstractFileByPath(outputFolderPath);
        if (!(outputFolder instanceof TFolder)) {
            throw new Error('Output folder does not exist.');
        }

        const subfolders = outputFolder.children.filter(f => f instanceof TFolder).map(f => f.name);

        const promptTemplate = this.settings.categorizationPrompt;
        const prompt = promptTemplate
            .replace("{summary}", summary)
            .replace("{existing_subjects}", subfolders.join(', '));

        const messages = [
            { role: 'system', content: this.settings.systemPrompt },
            { role: 'user', content: prompt },
        ];

        const category = await this.callVLLMAPI(messages);
        const categoryName = this.sanitizeFolderName(category.trim());

        // Check if categoryName exists, if not, create it
        const categoryPath = `${outputFolderPath}/${categoryName}`;
        let categoryFolder = this.app.vault.getAbstractFileByPath(categoryPath);
        if (!categoryFolder) {
            await this.app.vault.createFolder(categoryPath);
            categoryFolder = this.app.vault.getAbstractFileByPath(categoryPath);
        }

        if (!(categoryFolder instanceof TFolder)) {
            throw new Error(`Could not create or access category folder: ${categoryName}`);
        }

        return categoryFolder.path;
    }

    async createCanvasWithNodes(title: string, pdfFile: TFile, summary: string, subfolder: string): Promise<void> {
        // Ensure the title ends with .canvas (already handled in sanitizeFileName)
        const canvasPath = subfolder + '/' + title;

        // Create canvas data
        const canvasData = {
            nodes: [] as any[],
            edges: [] as any[],
        };

        // Create node for PDF file
        const pdfNode = {
            id: 'node' + Date.now(),
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            type: 'file',
            file: pdfFile.path,
        };

        // Create node for summary
        const summaryNode = {
            id: 'node' + (Date.now() + 1),
            x: pdfNode.x + pdfNode.width + 100,
            y: pdfNode.y,
            width: 300,
            height: 200,
            type: 'text',
            text: summary,
        };

        // Create edge connecting pdfNode to summaryNode
        const edge = {
            id: 'edge' + Date.now(),
            fromNode: pdfNode.id,
            fromSide: 'right',
            toNode: summaryNode.id,
            toSide: 'left',
        };

        canvasData.nodes.push(pdfNode);
        canvasData.nodes.push(summaryNode);
        canvasData.edges.push(edge);

        // Save canvas file
        const canvasJson = JSON.stringify(canvasData, null, 2);
        await this.app.vault.create(canvasPath, canvasJson);
    }

    async callVLLMAPI(messages: any[]): Promise<string> {
        const apiUrl = `${this.settings.vllmApiUrl}/api/chat`;
        const requestBody: any = {
            model: this.settings.model,
            messages: messages,
            stream: false,
            options: {
                num_ctx: this.settings.maxTokens,
                num_predict: -1,
                seed: 42,
                temperature: this.settings.temperature,
                top_k: this.settings.top_k,
                top_p: this.settings.top_p,
                repeat_penalty: this.settings.repeat_penalty,
                presence_penalty: this.settings.presence_penalty,
                frequency_penalty: this.settings.frequency_penalty,
            },
        };

        if (this.settings.debugMode) {
            console.log('Calling vLLM API with request body:', requestBody);
        }

        const headers: any = { 'Content-Type': 'application/json' };
        if (this.settings.apiToken && this.settings.apiToken.trim() !== '') {
            headers['Authorization'] = `Bearer ${this.settings.apiToken}`;
        }

        let response;
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
            });
        } catch (error) {
            console.error('Network error when calling vLLM API:', error);
            throw new Error('Network error when calling vLLM API.');
        }

        let data;
        try {
            data = await response.json();
        } catch (error) {
            console.error('Invalid JSON response from vLLM API:', error);
            throw new Error('Invalid JSON response from vLLM API.');
        }

        if (this.settings.debugMode) {
            console.log('Received response from vLLM API:', data);
        }

        if (data.error) {
            console.error('Error calling vLLM API:', data.error);
            throw new Error(data.error.message);
        }

        if (!data.message || !data.message.content) {
            console.error('Malformed response from vLLM API:', data);
            throw new Error('Malformed response from vLLM API.');
        }

        return data.message.content;
    }
}
