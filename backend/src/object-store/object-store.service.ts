import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppLogger } from '../common/logger/app-logger.service';

export interface ObjectHead {
  size: number;
  etag: string;
}

/**
 * Abstraction du stockage objet.
 *
 * Le reste du code ne connait que cette interface : il ne parle ni de Garage,
 * ni de MinIO, seulement de S3. Changer de backend S3-compatible ne touche
 * que ce fichier et les variables S3_*.
 *
 * Deux clients distincts, et c'est intentionnel :
 *  - `internal` signe et appelle Garage sur son adresse reseau Docker ;
 *  - `publicFacing` signe les URLs destinees au navigateur, sur l'adresse
 *    joignable depuis l'exterieur. La signature SigV4 couvre l'en-tete Host :
 *    une URL signee sur `http://garage:3900` serait invalide pour le client.
 */
@Injectable()
export class ObjectStoreService implements OnModuleInit {
  static readonly QUARANTINE_PREFIX = 'quarantine';
  static readonly DEPOSITS_PREFIX = 'deposits';

  private readonly internal: S3Client;
  private readonly publicFacing: S3Client;
  private readonly bucket: string;
  private readonly corsOrigins: string[];

  constructor(
    private readonly config: AppConfigService,
    private readonly logger: AppLogger,
  ) {
    this.bucket = this.config.get('S3_BUCKET');
    this.corsOrigins = this.config.get('CORS_ORIGINS');

    const credentials = {
      accessKeyId: this.config.get('S3_ACCESS_KEY'),
      secretAccessKey: this.config.get('S3_SECRET_KEY'),
    };
    const region = this.config.get('S3_REGION');

    // forcePathStyle : Garage sert le bucket dans le chemin, pas en sous-domaine.
    this.internal = new S3Client({
      endpoint: this.config.get('S3_ENDPOINT'),
      credentials,
      region,
      forcePathStyle: true,
    });

    this.publicFacing = new S3Client({
      endpoint: this.config.get('S3_PUBLIC_ENDPOINT'),
      credentials,
      region,
      forcePathStyle: true,
    });
  }

  /**
   * Le bucket et sa politique CORS sont provisionnes au demarrage, de facon
   * idempotente : le PUT presigne part du navigateur, il echouerait sans CORS.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
    await this.ensureCors();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket ${this.bucket} cree`, 'ObjectStore');
      } catch (error) {
        this.logger.warn(
          `Bucket ${this.bucket} non cree via l'API S3 (${(error as Error).message}). ` +
            `Il doit exister ou etre cree par install.sh.`,
          'ObjectStore',
        );
      }
    }
  }

  /**
   * Une regle CORS par origine, et non une regle listant toutes les origines.
   *
   * Garage renvoie l'integralite des `AllowedOrigins` d'une regle dans un seul
   * en-tete `Access-Control-Allow-Origin`. Le navigateur refuse alors le
   * preflight : la specification n'autorise qu'une valeur. Avec une origine
   * par regle, Garage selectionne la regle correspondant a l'en-tete `Origin`
   * de la requete et n'en renvoie qu'une.
   */
  async ensureCors(): Promise<void> {
    try {
      await this.internal.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: this.corsOrigins.map((origin) => ({
              AllowedOrigins: [origin],
              AllowedMethods: ['PUT'],
              AllowedHeaders: ['content-type', 'content-length'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            })),
          },
        }),
      );
      this.logger.log(
        `CORS applique sur ${this.bucket} pour ${this.corsOrigins.join(', ')}`,
        'ObjectStore',
      );
    } catch (error) {
      this.logger.warn(
        `CORS non applique sur ${this.bucket} : ${(error as Error).message}`,
        'ObjectStore',
      );
    }
  }

  quarantineKey(requestId: string, fileId: string): string {
    return `${ObjectStoreService.QUARANTINE_PREFIX}/${requestId}/${fileId}`;
  }

  depositKey(requestId: string, fileId: string): string {
    return `${ObjectStoreService.DEPOSITS_PREFIX}/${requestId}/${fileId}`;
  }

  /**
   * URL de depot direct. `ContentLength` est signe : le navigateur ne peut pas
   * televerser un fichier plus gros que celui qu'il a declare.
   */
  async presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });

    return getSignedUrl(this.publicFacing, command, {
      expiresIn: this.config.get('PRESIGN_PUT_TTL_SECONDS'),
    });
  }

  /** URL de telechargement courte, destinee au dashboard avocat. */
  async presignGet(key: string, downloadFilename: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadFilename)}"`,
    });

    return getSignedUrl(this.publicFacing, command, {
      expiresIn: this.config.get('PRESIGN_GET_TTL_SECONDS'),
    });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const result = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: result.ContentLength ?? 0,
        etag: (result.ETag ?? '').replace(/"/g, ''),
      };
    } catch {
      return null;
    }
  }

  /**
   * Lit les premiers octets d'un objet. Une plage suffit : on ne rapatrie
   * jamais un fichier entier dans l'API.
   */
  async readHead(key: string, bytes: number): Promise<Buffer> {
    const result = await this.internal.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.internal.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      }),
    );
  }

  async deleteKeys(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    let deleted = 0;
    // DeleteObjects est plafonne a 1000 cles par appel.
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      const result = await this.internal.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }),
      );
      deleted += result.Deleted?.length ?? 0;
    }
    return deleted;
  }

  async listPrefix(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.internal.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of result.Contents ?? []) {
        if (object.Key) {
          keys.push(object.Key);
        }
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return keys;
  }

  /** Suppression physique de tout un prefixe. Utilise par le reaper. */
  async deletePrefix(prefix: string): Promise<number> {
    return this.deleteKeys(await this.listPrefix(prefix));
  }

  /** Sonde de readiness : le bucket repond-il ? */
  async isReachable(): Promise<boolean> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}
