#!/usr/bin/env node

import { Command } from 'commander';
import { CleanupOrchestrator } from '../orchestrators/CleanupOrchestrator';
import { DockerClient } from '../clients/DockerClient';
import { ResourceScanner } from '../scanners/ResourceScanner';
import { BackupManager } from '../managers/BackupManager';
import { Reporter } from '../reporters/Reporter';
import { ProxmoxClient } from '../clients/ProxmoxClient';
import { CleanupConfig, ResourceType } from '../types';
import * as fs from 'fs';

/**
 * CLI interface for Proxmox Cleanup System
 */
class ProxmoxCleanupCLI {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupCommands();
  }

  /**
   * Setup CLI commands and options
   */
  private setupCommands(): void {
    this.program
      .name('proxmox-cleanup')
      .description('Automated cleanup tool for unused Docker resources on Proxmox infrastructure')
      .version('1.0.0');

    // Main cleanup command
    this.program
      .command('cleanup')
      .description('Execute cleanup of unused Docker resources')
      .option('-d, --dry-run', 'Preview what would be removed without actually removing anything')
      .option('-t, --types <types>', 'Comma-separated list of resource types to clean (containers,images,volumes,networks)', 'all')
      .option('-p, --protect <patterns>', 'Comma-separated list of protection patterns (wildcards supported)', '')
      .option('-b, --backup', 'Create backup before cleanup (enabled by default)', true)
      .option('--no-backup', 'Disable backup creation')
      .option('--backup-path <path>', 'Custom backup directory path', './backups')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('--log-path <path>', 'Custom log directory path', './logs')
      .option('--proxmox-host <host>', 'Proxmox host address')
      .option('--proxmox-token <token>', 'Proxmox API token (format: user@realm:password)')
      .option('--proxmox-node <node>', 'Proxmox node ID')
      .action(async (options) => {
        try {
          await this.executeCleanup(options);
        } catch (error) {
          console.error('❌ Cleanup failed:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });

    // Dry-run command (shortcut)
    this.program
      .command('dry-run')
      .description('Preview what would be removed without actually removing anything')
      .option('-t, --types <types>', 'Comma-separated list of resource types to scan (containers,images,volumes,networks)', 'all')
      .option('-p, --protect <patterns>', 'Comma-separated list of protection patterns (wildcards supported)', '')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('--log-path <path>', 'Custom log directory path', './logs')
      .option('--proxmox-host <host>', 'Proxmox host address')
      .option('--proxmox-token <token>', 'Proxmox API token (format: user@realm:password)')
      .option('--proxmox-node <node>', 'Proxmox node ID')
      .action(async (options) => {
        try {
          await this.executeDryRun(options);
        } catch (error) {
          console.error('❌ Dry-run failed:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });

    // List resources command
    this.program
      .command('list')
      .description('List unused Docker resources without removing them')
      .option('-t, --types <types>', 'Comma-separated list of resource types to list (containers,images,volumes,networks)', 'all')
      .option('-p, --protect <patterns>', 'Comma-separated list of protection patterns (wildcards supported)', '')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('--sort-by-size', 'Sort resources by size (largest first)', true)
      .action(async (options) => {
        try {
          await this.listResources(options);
        } catch (error) {
          console.error('❌ List failed:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });

    // Config validation command
    this.program
      .command('validate-config')
      .description('Validate configuration file')
      .option('-c, --config <path>', 'Path to configuration file', './config.json')
      .action(async (options) => {
        try {
          await this.validateConfig(options);
        } catch (error) {
          console.error('❌ Config validation failed:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      });
  }

  /**
   * Execute cleanup operation
   */
  private async executeCleanup(options: any): Promise<void> {
    console.log('🚀 Starting Proxmox Docker cleanup...\n');

    const config = await this.loadConfig(options);
    const orchestrator = await this.createOrchestrator(config);

    const report = await orchestrator.executeCleanup();

    this.displayReport(report, false);

    if (report.details.errors.length > 0) {
      process.exit(1);
    }
  }

  /**
   * Execute dry-run operation
   */
  private async executeDryRun(options: any): Promise<void> {
    console.log('🔍 Starting dry-run preview...\n');

    const config = await this.loadConfig(options);
    const orchestrator = await this.createOrchestrator(config);

    const report = await orchestrator.executeDryRun();

    this.displayReport(report, true);
  }

  /**
   * List unused resources
   */
  private async listResources(options: any): Promise<void> {
    console.log('📋 Listing unused Docker resources...\n');

    const config = await this.loadConfig(options);

    // Create components
    const dockerClient = new DockerClient();
    const resourceScanner = new ResourceScanner(dockerClient, config.cleanup.protectedPatterns);

    // Set dry-run mode for listing
    resourceScanner.setDryRun(true);

    // Connect and scan
    await dockerClient.connect();

    const [containers, images, volumes, networks] = await Promise.all([
      resourceScanner.scanContainers(),
      resourceScanner.scanImages(),
      resourceScanner.scanVolumes(),
      resourceScanner.scanNetworks()
    ]);

    const allResources = [...containers, ...images, ...volumes, ...networks];

    // Filter by type
    const filteredResources = this.filterResourcesByType(allResources, options.types);

    // Sort by size if requested
    const sortedResources = options.sortBySize
      ? resourceScanner.sortResourcesBySize(filteredResources)
      : filteredResources;

    // Display results
    this.displayResourceList(sortedResources);
  }

  /**
   * Validate configuration file
   */
  private async validateConfig(options: any): Promise<void> {
    console.log('✅ Validating configuration...\n');

    try {
      const config = await this.loadConfig(options);

      // Basic validation
      this.validateConfigStructure(config);

      // Test Proxmox connection if configured
      if (config.proxmox.host && config.proxmox.token) {
        console.log('🔗 Testing Proxmox connection...');
        const proxmoxClient = new ProxmoxClient(config.proxmox);

        await proxmoxClient.authenticate();
        console.log('✅ Proxmox connection successful');
      }

      // Test Docker connection
      console.log('🐳 Testing Docker connection...');
      const dockerClient = new DockerClient();
      await dockerClient.connect();
      console.log('✅ Docker connection successful');

      console.log('\n🎉 Configuration is valid!');

    } catch (error) {
      throw new Error(`Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load configuration from file or CLI options
   */
  private async loadConfig(options: any): Promise<CleanupConfig> {
    let config: CleanupConfig;

    // Load from config file if specified
    if (options.config && fs.existsSync(options.config)) {
      const configContent = fs.readFileSync(options.config, 'utf8');
      config = JSON.parse(configContent);
    } else {
      // Create default config
      config = this.createDefaultConfig();
    }

    // Override with CLI options
    this.applyCliOptions(config, options);

    return config;
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): CleanupConfig {
    return {
      proxmox: {
        host: '',
        token: '',
        nodeId: ''
      },
      cleanup: {
        dryRun: false,
        resourceTypes: [],
        protectedPatterns: [],
        backupEnabled: true,
        backupPath: './backups'
      },
      reporting: {
        verbose: false,
        logPath: './logs'
      }
    };
  }

  /**
   * Apply CLI options to configuration
   */
  private applyCliOptions(config: CleanupConfig, options: any): void {
    // Dry-run mode
    if (options.dryRun) {
      config.cleanup.dryRun = true;
    }

    // Resource types
    if (options.types && options.types !== 'all') {
      config.cleanup.resourceTypes = this.parseResourceTypes(options.types);
    }

    // Protection patterns
    if (options.protect) {
      config.cleanup.protectedPatterns = options.protect.split(',').map((p: string) => p.trim());
    }

    // Backup settings
    if (options.backup !== undefined) {
      config.cleanup.backupEnabled = options.backup;
    }
    if (options.backupPath) {
      config.cleanup.backupPath = options.backupPath;
    }

    // Reporting settings
    if (options.verbose) {
      config.reporting.verbose = true;
    }
    if (options.logPath) {
      config.reporting.logPath = options.logPath;
    }

    // Proxmox settings
    if (options.proxmoxHost) {
      config.proxmox.host = options.proxmoxHost;
    }
    if (options.proxmoxToken) {
      config.proxmox.token = options.proxmoxToken;
    }
    if (options.proxmoxNode) {
      config.proxmox.nodeId = options.proxmoxNode;
    }
  }

  /**
   * Parse resource types from string
   */
  private parseResourceTypes(typesString: string): ResourceType[] {
    const typeMapping: Record<string, ResourceType> = {
      'container': 'container',
      'containers': 'container',
      'image': 'image',
      'images': 'image',
      'volume': 'volume',
      'volumes': 'volume',
      'network': 'network',
      'networks': 'network'
    };

    const types = typesString.split(',').map(t => t.trim().toLowerCase());

    const parsedTypes: ResourceType[] = [];
    for (const type of types) {
      const mappedType = typeMapping[type];
      if (mappedType) {
        parsedTypes.push(mappedType);
      } else {
        throw new Error(`Invalid resource type: ${type}. Valid types: ${Object.keys(typeMapping).join(', ')}`);
      }
    }

    return parsedTypes;
  }

  /**
   * Filter resources by type
   */
  private filterResourcesByType(resources: any[], typesString: string): any[] {
    if (!typesString || typesString === 'all') {
      return resources;
    }

    const types = this.parseResourceTypes(typesString);
    return resources.filter(resource => types.includes(resource.type));
  }

  /**
   * Create orchestrator with all dependencies
   */
  private async createOrchestrator(config: CleanupConfig): Promise<CleanupOrchestrator> {
    // Create Docker client
    const dockerClient = new DockerClient();
    await dockerClient.connect();

    // Create resource filter and scanner
    const resourceScanner = new ResourceScanner(dockerClient, config.cleanup.protectedPatterns);
    resourceScanner.setDryRun(config.cleanup.dryRun);

    // Create backup manager
    const backupManager = new BackupManager(config.cleanup.backupPath);

    // Create reporter
    const reporter = new Reporter(config.reporting.logPath);

    // Create Proxmox client if configured
    let proxmoxClient;
    if (config.proxmox.host && config.proxmox.token) {
      proxmoxClient = new ProxmoxClient(config.proxmox);
      await proxmoxClient.authenticate();
    }

    return new CleanupOrchestrator(
      dockerClient,
      resourceScanner,
      backupManager,
      reporter,
      config,
      proxmoxClient
    );
  }

  /**
   * Display cleanup report
   */
  private displayReport(report: any, isDryRun: boolean): void {
    const mode = isDryRun ? 'DRY-RUN' : 'CLEANUP';
    const emoji = isDryRun ? '🔍' : '🧹';

    console.log(`\n${emoji} ${mode} REPORT`);
    console.log('='.repeat(50));

    console.log(`📊 Resources Scanned: ${report.summary.resourcesScanned}`);
    console.log(`${isDryRun ? '📋' : '🗑️'} Resources${isDryRun ? ' Would Be' : ''} Removed: ${report.summary.resourcesRemoved}`);
    console.log(`💾 Disk Space ${isDryRun ? 'Would Be' : ''} Freed: ${this.formatBytes(report.summary.diskSpaceFreed)}`);
    console.log(`⏱️ Execution Time: ${report.summary.executionTime}ms`);

    if (report.details.skipped.length > 0) {
      console.log(`⏭️ Resources Skipped: ${report.details.skipped.length}`);
    }

    if (report.details.errors.length > 0) {
      console.log(`❌ Errors: ${report.details.errors.length}`);
      report.details.errors.forEach((error: any) => {
        console.log(`   • ${error.message}`);
      });
    }

    // Show detailed resource list if verbose or dry-run
    if (isDryRun || report.details.removed.length <= 10) {
      if (report.details.removed.length > 0) {
        console.log(`\n📋 ${isDryRun ? 'Resources to be removed:' : 'Removed resources:'}`);
        report.details.removed.forEach((resource: any) => {
          const icon = this.getResourceIcon(resource.type);
          console.log(`   ${icon} ${resource.name} (${resource.type}) - ${this.formatBytes(resource.size)}`);
        });
      }
    }

    console.log('\n' + '='.repeat(50));

    if (isDryRun) {
      console.log('💡 This was a dry-run. No resources were actually removed.');
      console.log('💡 Run without --dry-run to perform actual cleanup.');
    } else {
      console.log('✅ Cleanup completed successfully!');
    }
  }

  /**
   * Display resource list
   */
  private displayResourceList(resources: any[]): void {
    if (resources.length === 0) {
      console.log('🎉 No unused resources found!');
      return;
    }

    console.log(`📋 Found ${resources.length} unused resources:\n`);

    // Group by type
    const grouped = resources.reduce((acc, resource) => {
      if (!acc[resource.type]) {
        acc[resource.type] = [];
      }
      acc[resource.type].push(resource);
      return acc;
    }, {});

    // Display each type
    Object.entries(grouped).forEach(([type, typeResources]: [string, any]) => {
      const icon = this.getResourceIcon(type);
      const totalSize = typeResources.reduce((sum: number, r: any) => sum + r.size, 0);

      console.log(`${icon} ${type.toUpperCase()} (${typeResources.length} items, ${this.formatBytes(totalSize)})`);

      typeResources.forEach((resource: any) => {
        console.log(`   • ${resource.name} - ${this.formatBytes(resource.size)}`);
      });

      console.log('');
    });

    const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
    console.log(`💾 Total reclaimable space: ${this.formatBytes(totalSize)}`);
  }

  /**
   * Get emoji icon for resource type
   */
  private getResourceIcon(type: string): string {
    const icons: Record<string, string> = {
      container: '📦',
      image: '🖼️',
      volume: '💾',
      network: '🌐'
    };
    return icons[type] || '📄';
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate configuration structure
   */
  private validateConfigStructure(config: CleanupConfig): void {
    if (!config.proxmox || !config.cleanup || !config.reporting) {
      throw new Error('Invalid configuration structure. Missing required sections.');
    }

    if (config.cleanup.resourceTypes) {
      const validTypes: ResourceType[] = ['container', 'image', 'volume', 'network'];
      const invalidTypes = config.cleanup.resourceTypes.filter(type => !validTypes.includes(type));
      if (invalidTypes.length > 0) {
        throw new Error(`Invalid resource types in config: ${invalidTypes.join(', ')}`);
      }
    }
  }

  /**
   * Run the CLI
   */
  public async run(): Promise<void> {
    await this.program.parseAsync(process.argv);
  }
}

// Run CLI if this file is executed directly
if (require.main === module) {
  const cli = new ProxmoxCleanupCLI();
  cli.run().catch(error => {
    console.error('❌ CLI Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { ProxmoxCleanupCLI };
