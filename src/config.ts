import OSS from 'ali-oss'

export interface PublisherOssConfig extends OSS.Options {
  basePath?: string
  // 自定义更新路径规则
  keyResolver?: (fileName: string, platform: string, arch: string) => string;
}
