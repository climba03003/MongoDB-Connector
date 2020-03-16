import { EventEmitter } from '@climba03003/event-emitter';
import * as Validator from '@climba03003/validator';
import { Collection, Db, MongoClient, MongoClientOptions } from 'mongodb';
import * as console from './utilities';

export class Connector extends EventEmitter {
  private static __i: Connector;

  private static __defaultOpts: Partial<MongoClientOptions> = {
    useNewUrlParser: true,
    useUnifiedTopology: true
  };

  // if Connection String is empty, localhost:27017 will be prefered
  private __cs: string = 'mongodb://127.0.0.1:27017/';

  // if database name is empty, default will be prefered
  private __dbn: string = 'default';

  // useNewUrlParser and useUnifiedTopology is default true
  private __opt: MongoClientOptions = Connector.__defaultOpts;

  private client?: MongoClient;
  public db?: Db;

  constructor(cs: string, opt: MongoClientOptions) {
    super();
    console.debug('Create new instance [%s] with options %j', cs, opt);

    this.connectionString = cs;
    console.debug('Use connection string: %s', this.connectionString);
    console.debug('Use database name: %s', this.databaseName);
    this.options = opt;
    console.debug('Use connection options: %j', this.options);

    this.__bindEvent = this.__bindEvent.bind(this);
    this.onRetries = this.onRetries.bind(this);
    this.onClose = this.onClose.bind(this);
    this.off('connected', this.__bindEvent);
    this.on('connected', this.__bindEvent);
  }

  // Connect to MongoDB
  public async connect(cs: string = this.connectionString, opt: MongoClientOptions = this.options): Promise<Connector> {
    this.connectionString = cs;
    this.options = opt;

    if (Validator.String.isString(this.connectionString)) {
      console.debug('Connecting to client %s.', this.connectionString);
      try {
        this.client = await MongoClient.connect(this.connectionString, this.options);
        console.debug('Connected to client %s', this.connectionString);
        this.emit('connected', this.client);
      } catch (err) {
        console.warn('Connection failed wait until options change.\n%j', err);
        this.emit('connection-failed', this.client);
        // add retires listener
        this.on('setting-changed', this.onRetries);
        // retires if setting not change by 3s
        setTimeout(this.onRetries, 3000);
      }
    }

    return this;
  }

  public async onRetries() {
    // remove retires listener
    this.off('setting-changed', this.onRetries);
    console.log('Rety connecting to %s.', this.connectionString);
    await this.connect();
  }

  // Get Database
  public async database(dbn: string = this.databaseName): Promise<Connector> {
    // connect when it is not connected
    if (Validator.Empty.isEmpty(this.client)) {
      await this.connect();
    }

    this.databaseName = dbn;

    console.debug('Connecting to database %s.', this.databaseName);
    this.db = await this.client?.db(this.databaseName);
    console.debug('Connected to database %s.', this.databaseName);

    return this;
  }

  public async collection(collectionName: string): Promise<Collection> {
    console.debug('Retrieving collection %s.', collectionName);
    // connect when it is not connected
    if (Validator.Empty.isEmpty(this.client) || Validator.Empty.isEmpty(this.db)) {
      await this.database();
    }

    const collection = (await this.db?.collection(collectionName)) as Collection;
    console.debug('Retrieved collection %s', collectionName);

    return collection;
  }

  private __bindEvent(client: MongoClient) {
    this.on('setting-changed', this.onRetries);
    this.on('setting-changed', this.onRetries);
    client.off('close', this.onClose);
    client.on('close', this.onClose);
  }

  private onClose() {
    console.debug('Disconnected from client %s.', this.connectionString);
    this.emit('disconnect', this.client);
  }

  public static instance(cs?: string, opt?: MongoClientOptions) {
    console.debug('Try to retrieve connector instance [%s] with options %j', cs, opt);

    cs = String(cs);
    opt = Object.assign({}, opt);

    if (Validator.Undefined.isUndefined(Connector.__i) || Validator.Null.isNull(Connector.__i)) {
      Connector.__i = new Connector(cs, opt);
    }

    // replace connection string
    Connector.__i.connectionString = cs;
    // replace options
    Connector.__i.options = opt;

    return Connector.__i;
  }

  get connectionString(): string {
    return this.__cs;
  }

  set connectionString(cs: string) {
    const o = String(this.__cs);
    if (
      !Validator.Empty.isEmpty(cs) &&
      Validator.String.isString(cs) &&
      Validator.MongoDB.ConnectionString.isConnectionString(cs) &&
      !Validator.String.isIdentical(cs, o)
    ) {
      this.__cs = cs;
      this.emit('connection-string-changed', this.__cs, o);
      this.emit('setting-changed', {
        type: 'connection-string',
        current: this.__cs,
        previous: o
      });
    }
  }

  get databaseName(): string {
    return this.__dbn;
  }

  set databaseName(dbn: string) {
    const o = String(this.__dbn);
    if (!Validator.Empty.isEmpty(dbn) && Validator.String.isString(dbn) && !Validator.String.isIdentical(dbn, o)) {
      this.__dbn = dbn;
      this.emit('database-name-changed', this.__dbn, o);
      this.emit('setting-changed', {
        type: 'database-name',
        current: this.__dbn,
        previous: o
      });
    }
  }

  get options(): MongoClientOptions {
    return this.__opt;
  }

  set options(opt: MongoClientOptions) {
    const o = Object.assign({}, this.__opt);
    if (!Validator.Empty.isEmpty(opt) && Validator.JSON.isJSON(opt) && !Validator.JSON.isIdentical(opt, o)) {
      this.__opt = Object.assign({}, Connector.__defaultOpts, opt);
      this.emit('options-changed', this.__opt, o);
      this.emit('setting-changed', {
        type: 'options',
        current: this.__opt,
        previous: o
      });
    }
  }
}

export interface Connector {
  // overload event emitter on method
  on(eventName: 'connected', listener: EventConnectedCallback): this;
  on(eventName: 'disconnect', listener: EventDisconnectCallback): this;
  on(eventName: 'connection-failed', listener: EventConnectionFailedCallback): this;
  on(eventName: 'connection-string-changed', listener: EventConnectionStringChangedCallback): this;
  on(eventName: 'database-name-changed', listener: EventDatabaseNameChangedCallback): this;
  on(eventName: 'options-changed', listener: EventOptionsChangedCallback): this;
  on(eventName: 'setting-changed', listener: EventSettingChangedCallback): this;
}

export type EventConnectedCallback = (client: MongoClient) => void;
export type EventDisconnectCallback = (client: MongoClient) => void;
export type EventConnectionFailedCallback = (client: MongoClient) => void;
export type EventConnectionStringChangedCallback = (current: string, previous: string) => void;
export type EventDatabaseNameChangedCallback = (current: string, previous: string) => void;
export type EventOptionsChangedCallback = (current: MongoClientOptions, previous: MongoClientOptions) => void;
export type EventSettingChangedCallback = (args: {
  type: 'connection-string' | 'database-name' | 'options';
  current: any;
  previous: any;
}) => void;
