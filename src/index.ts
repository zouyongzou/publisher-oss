import path from 'path'
import OSS from 'ali-oss'
import {PublisherOptions, PublisherStatic,} from '@electron-forge/publisher-static';

import { PublisherOssConfig } from './config'

type OssArtifact = {
  path: string
  version: string
  platform: string
  arch: string
}

type ReleaseJSON = {
  currentRelease: string
  releases: Releases[]
}

type Releases = {
  version: string
  updateTo: {
    version: string
    pub_date: Date
    notes: string
    name: string
    url: string
  }
}

export default class PublisherOss extends PublisherStatic<PublisherOssConfig> {
  name = 'oss'

  async publish({makeResults, setStatusLine}: PublisherOptions): Promise<void> {
    const { config } = this
    const ossClient = new OSS(config)
    const artifacts: OssArtifact[] = []

    for (const makeResult of makeResults) {
      artifacts.push(
        ...makeResult.artifacts.map((artifact) => ({
          path: artifact,
          version: makeResult.packageJSON.version,
          platform: makeResult.platform,
          arch: makeResult.arch,
        }))
      )
    }

    let uploaded = 0
    let releaseArtifact: any
    const details: string[] = []
    const updateStatusLine = () => setStatusLine(`Uploading Artifacts ${uploaded}/${artifacts.length}\n  ${details.join('\t')}`);

    updateStatusLine();
    await Promise.all(artifacts.map(async (artifact, i) => {
      const name = this.generateName(artifact)
      const artifactPath = artifact.path
      const basename = path.basename(artifactPath)
      const extname = path.extname(artifactPath)

      await ossClient.multipartUpload(name, artifactPath, {
        progress: (p: number) => {
          details[i] = `<${basename}>: ${Math.round(p * 100)}%`
          updateStatusLine();
        }
      })
      uploaded += 1
      details[i] = `<${basename}>: 100%`
      updateStatusLine();
      if (extname && ['.dmg', '.exe'].includes(extname)) {
        releaseArtifact = artifact
      }
    }))

    if (releaseArtifact) {
      this.setRelease(ossClient, releaseArtifact)
    }
  }

  generateName(artifact: OssArtifact) {
    const { config: { basePath = '' } } = this
    const { platform, version, path: artifactPath } = artifact
    return `${basePath}/${platform}/${version}/${path.basename(artifactPath)}`
  }

  async setRelease(ossClient: OSS, artifact: OssArtifact) {
    const { config: { basePath = '' } } = this
    const { platform, version, path: artifactPath } = artifact

    let releaseJson: ReleaseJSON
    try {
      let result = await ossClient.get(`${basePath}/${platform}/release.json`)
      releaseJson = JSON.parse(`${result.content}`)
    } catch (e) {
      releaseJson = {
        currentRelease: '',
        releases: []
      }
    }

    const url = ossClient.generateObjectUrl(`${basePath}/${platform}/${version}/${encodeURIComponent(path.basename(artifactPath))}`)

    releaseJson.currentRelease = version
    releaseJson.releases.push({
      version,
      updateTo: {
        version,
        pub_date: new Date(),
        notes: `version：${version}`,
        name: version,
        url
      }
    })

    const result = await ossClient.put(`${basePath}/${platform}/release.json`, Buffer.from(JSON.stringify(releaseJson)))
    if (result?.name) {
      console.log('  <release.json> uploaded successfully!')
    }
  }
}

export {PublisherOss};