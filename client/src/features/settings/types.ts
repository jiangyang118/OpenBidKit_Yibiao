import type { AppTheme, DisplayLanguage, FileParserConfig, ImageModelConfig, ImageModelProfiles, SidebarLayout, TextModelConfig, TextModelProfiles, TextModelProvider, UpdateChannel } from '../../shared/types';

export interface SettingsPageState {
  textModel: TextModelConfig & {
    provider: TextModelProvider;
  };
  textModelProfiles: TextModelProfiles;
  imageModel: ImageModelConfig;
  imageModelProfiles: ImageModelProfiles;
  fileParser: FileParserConfig;
  general: {
    language: DisplayLanguage;
    theme: AppTheme;
    sidebar_layout: SidebarLayout;
    developer_mode: boolean;
    update_channel: UpdateChannel;
    gpu_hardware_acceleration_enabled: boolean;
    gpu_hardware_acceleration_configured: boolean;
  };
}
