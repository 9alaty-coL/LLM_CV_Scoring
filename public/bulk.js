// Bulk CV Scoring Client-Side Logic

class BulkProcessor {
    constructor() {
        this.cvFiles = new Map();
        this.jdFiles = new Map();
        this.csvConfigurations = [];
        this.currentJobId = null;
        this.progressInterval = null;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // CV Upload
        const cvUploadArea = document.getElementById('cvUploadArea');
        const cvFileInput = document.getElementById('cvFileInput');
        
        cvUploadArea.addEventListener('click', () => cvFileInput.click());
        cvUploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        cvUploadArea.addEventListener('drop', (e) => this.handleFileDrop(e, 'cv'));
        cvFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'cv'));

        // JD Upload
        const jdUploadArea = document.getElementById('jdUploadArea');
        const jdFileInput = document.getElementById('jdFileInput');
        
        jdUploadArea.addEventListener('click', () => jdFileInput.click());
        jdUploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        jdUploadArea.addEventListener('drop', (e) => this.handleFileDrop(e, 'jd'));
        jdFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'jd'));

        // CSV Upload
        const csvUploadArea = document.getElementById('csvUploadArea');
        const csvFileInput = document.getElementById('csvFileInput');
        
        csvUploadArea.addEventListener('click', () => csvFileInput.click());
        csvUploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        csvUploadArea.addEventListener('drop', (e) => this.handleFileDrop(e, 'csv'));
        csvFileInput.addEventListener('change', (e) => this.handleFileSelect(e, 'csv'));

        // Buttons
        document.getElementById('downloadTemplate').addEventListener('click', this.downloadTemplate.bind(this));
        document.getElementById('startProcessing').addEventListener('click', this.startProcessing.bind(this));
        document.getElementById('downloadResults').addEventListener('click', this.downloadResults.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('dragover');
    }

    handleFileDrop(e, type) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        this.processFiles(files, type);
    }

    handleFileSelect(e, type) {
        const files = Array.from(e.target.files);
        this.processFiles(files, type);
    }

    async processFiles(files, type) {
        if (type === 'csv') {
            if (files.length > 1) {
                this.showError('Please select only one CSV file');
                return;
            }
            await this.uploadCsvFile(files[0]);
        } else {
            await this.uploadFiles(files, type);
        }
    }

    async uploadFiles(files, type) {
        const formData = new FormData();
        const fieldName = type === 'cv' ? 'cvFiles' : 'jdFiles';
        
        files.forEach(file => {
            formData.append(fieldName, file);
        });

        try {
            this.showLoading(`Uploading ${type.toUpperCase()} files...`);
            
            const response = await fetch(`/api/bulk/upload-${type}s`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                if (type === 'cv') {
                    result.files.forEach(file => {
                        this.cvFiles.set(file.name, file);
                    });
                    this.updateFileList('cvFileList', this.cvFiles, 'cv');
                } else {
                    result.files.forEach(file => {
                        this.jdFiles.set(file.name, file);
                    });
                    this.updateFileList('jdFileList', this.jdFiles, 'jd');
                }
                this.showSuccess(result.message);
                this.updateProcessingButton();
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError(`Upload failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async uploadCsvFile(file) {
        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            this.showLoading('Processing CSV file...');
            
            const response = await fetch('/api/bulk/upload-csv', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                this.csvConfigurations = result.configurations;
                this.updateFileList('csvFileList', new Map([[file.name, { name: file.name, size: file.size }]]), 'csv');
                this.showSuccess(result.message);
                this.updateProcessingButton();
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError(`CSV upload failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    updateFileList(containerId, filesMap, type) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        if (filesMap.size === 0) {
            container.innerHTML = '<p style="color: #666; text-align: center;">No files uploaded</p>';
            return;
        }

        filesMap.forEach((file, fileName) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span>${fileName} (${this.formatFileSize(file.size)})</span>
                <button class="remove-file" onclick="bulkProcessor.removeFile('${fileName}', '${type}')">Remove</button>
            `;
            container.appendChild(fileItem);
        });
    }

    removeFile(fileName, type) {
        if (type === 'cv') {
            this.cvFiles.delete(fileName);
            this.updateFileList('cvFileList', this.cvFiles, 'cv');
        } else if (type === 'jd') {
            this.jdFiles.delete(fileName);
            this.updateFileList('jdFileList', this.jdFiles, 'jd');
        } else if (type === 'csv') {
            this.csvConfigurations = [];
            document.getElementById('csvFileList').innerHTML = '<p style="color: #666; text-align: center;">No files uploaded</p>';
        }
        this.updateProcessingButton();
    }

    updateProcessingButton() {
        const startButton = document.getElementById('startProcessing');
        const canProcess = this.csvConfigurations.length > 0 && 
                          this.cvFiles.size > 0 && 
                          this.jdFiles.size > 0;
        
        startButton.disabled = !canProcess;
        
        if (canProcess) {
            startButton.textContent = `🚀 Start Processing (${this.csvConfigurations.length} items)`;
        } else {
            startButton.textContent = '🚀 Start Bulk Processing';
        }
    }

    async startProcessing() {
        try {
            this.showLoading('Starting bulk processing...');
            
            const response = await fetch('/api/bulk/process-bulk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    configurations: this.csvConfigurations
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.currentJobId = result.jobId;
                this.showProgress();
                this.startProgressTracking();
                this.showSuccess('Processing started successfully!');
            } else {
                this.showError(result.error);
            }
        } catch (error) {
            this.showError(`Failed to start processing: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    startProgressTracking() {
        this.progressInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/bulk/status/${this.currentJobId}`);
                const result = await response.json();
                
                if (result.success) {
                    const job = result.job;
                    this.updateProgress(job.progress, job.currentItem);
                    
                    if (job.status === 'completed') {
                        this.onProcessingComplete();
                    } else if (job.status === 'failed') {
                        this.onProcessingFailed(job.error);
                    }
                }
            } catch (error) {
                console.error('Progress tracking error:', error);
            }
        }, 2000); // Check every 2 seconds
    }

    updateProgress(percentage, currentItem) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}% - ${currentItem || 'Processing...'}`;
    }

    onProcessingComplete() {
        clearInterval(this.progressInterval);
        this.updateProgress(100, 'Processing completed successfully!');
        
        setTimeout(() => {
            this.hideProgress();
            this.showResults();
        }, 2000);
    }

    onProcessingFailed(error) {
        clearInterval(this.progressInterval);
        this.hideProgress();
        this.showError(`Processing failed: ${error}`);
    }

    async downloadResults() {
        if (!this.currentJobId) {
            this.showError('No results available for download');
            return;
        }

        try {
            const response = await fetch(`/api/bulk/download/${this.currentJobId}`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bulk_scoring_results_${this.currentJobId}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showSuccess('Results downloaded successfully!');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Download failed');
            }
        } catch (error) {
            this.showError(`Download failed: ${error.message}`);
        }
    }

    async downloadTemplate() {
        try {
            const response = await fetch('/api/bulk/template');
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'bulk_scoring_template.csv';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showSuccess('Template downloaded successfully!');
            } else {
                this.showError('Failed to download template');
            }
        } catch (error) {
            this.showError(`Template download failed: ${error.message}`);
        }
    }

    showProgress() {
        document.getElementById('progressContainer').style.display = 'block';
    }

    hideProgress() {
        document.getElementById('progressContainer').style.display = 'none';
    }

    showResults() {
        document.getElementById('resultsSection').style.display = 'block';
    }

    showLoading(message) {
        // Simple loading implementation - could be enhanced with a proper loading overlay
        console.log('Loading:', message);
    }

    hideLoading() {
        console.log('Loading complete');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 6px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            max-width: 400px;
            background: ${type === 'success' ? '#27ae60' : '#e74c3c'};
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Click to dismiss
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the bulk processor when the page loads
const bulkProcessor = new BulkProcessor();

// Make it globally available for onclick handlers
window.bulkProcessor = bulkProcessor;
