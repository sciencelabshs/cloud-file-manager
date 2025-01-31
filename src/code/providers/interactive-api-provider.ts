import queryString from 'query-string'
import { cloneDeep } from 'lodash'
import React from 'react'
import { CFMLaraProviderOptions, CFMLaraProviderLogData } from '../app-options'
import { CloudFileManagerClient } from '../client'
import {
  cloudContentFactory, CloudMetadata, ECapabilities, ProviderInterface,
  ProviderLoadCallback, ProviderOpenCallback, ProviderSaveCallback
}  from './provider-interface'
import {
  getInitInteractiveMessage, getInteractiveState as _getInteractiveState, IInitInteractive, IInteractiveStateProps,
  readAttachment, setInteractiveState as _setInteractiveState, writeAttachment, flushStateUpdates
} from '@concord-consortium/lara-interactive-api'
import { SelectInteractiveStateDialogProps } from '../views/select-interactive-state-dialog-view'
import { isEmptyObject } from '../utils/is-empty-object'

export const shouldSaveAsAttachment = (content: any) => {
  const interactiveApi = queryString.parse(location.search).interactiveApi
  if (interactiveApi === kAttachmentUrlParameter) {
    return true
  }

  const aboveDynamicThreshold = JSON.stringify(content).length >= kDynamicAttachmentSizeThreshold
  if (aboveDynamicThreshold) {
    return true
  }

  return false
}

const getInteractiveState = () => cloneDeep(_getInteractiveState())
export const setInteractiveState = async (_newState: any): Promise<{error: string}> => {
  let savedInteractiveState: any
  const newState = cloneDeep(_newState)
  if (shouldSaveAsAttachment(newState)) {
    const contentType = newState === 'string' ? 'text/plain' : 'application/json'
    const content = contentType === 'application/json' ? JSON.stringify(newState) : newState
    const response = await writeAttachment({ name: kAttachmentFilename, content, contentType })
    if (!response.ok) {
      return {error: response.statusText}
    }
    savedInteractiveState = interactiveStateAttachment(contentType)
  }
  else {
    savedInteractiveState = newState
  }

  _setInteractiveState(savedInteractiveState)
  // don't wait for the 2000ms timeout to save
  flushStateUpdates()

  return {error: null}
}

interface InteractiveApiProviderParams {
  documentId?: string;
  interactiveState?: any;
}

// pass `interactiveApi=attachment` as url parameter to always save state as an attachment
export const kAttachmentUrlParameter = "attachment"

// can save it twice with room to spare in 1MB Firestore limit
export const kDynamicAttachmentSizeThreshold = 480 * 1024

// in solidarity with legacy DocumentStore implementation and S3 sharing implementation
export const kAttachmentFilename = "file.json"

// when writing attachments, interactive state is just a reference to the attachment
interface InteractiveStateAttachment {
  __attachment__: typeof kAttachmentFilename,
  contentType?: "application/json" | "text/plain"
}
const interactiveStateAttachment =
(contentType?: InteractiveStateAttachment["contentType"]): InteractiveStateAttachment => {
  return { __attachment__: kAttachmentFilename, contentType }
}
const isInteractiveStateAttachment = (content: any) =>
        (typeof content === "object") && (content.__attachment__ === kAttachmentFilename)

// This provider supports LARA interactives that save/restore state via the LARA interactive API.
// To signal to the CFM that this provider should handle save/restore operations, add
// `interactiveApi` to the query params, e.g. `?interactiveApi` or `?interactiveApi=true`.
class InteractiveApiProvider extends ProviderInterface {
  static Name = 'interactiveApi'
  client: CloudFileManagerClient
  options: CFMLaraProviderOptions
  initInteractivePromise: Promise<IInitInteractive>
  readyPromise: Promise<boolean>
  initInteractiveMessage: IInitInteractive

  constructor(options: CFMLaraProviderOptions, client: CloudFileManagerClient) {
    super({
      name: InteractiveApiProvider.Name,
      capabilities: {
        save: true,
        resave: true,
        "export": false,
        load: true,
        list: false,
        remove: false,
        rename: false,
        close: false
      }
    })
    this.options = options
    this.client = client

    this.handleInitInteractive()
  }

  getInitInteractiveMessage() {
    return this.initInteractivePromise ??
            (this.initInteractivePromise = getInitInteractiveMessage() as Promise<IInitInteractive>)
  }

  isReady() {
    return this.readyPromise
  }

  logLaraData(interactiveStateUrl?: string, runRemoteEndpoint?: string) {
    if (runRemoteEndpoint) {
      const laraData: CFMLaraProviderLogData = {
        operation: 'open',
        runStateUrl: interactiveStateUrl,
        run_remote_endpoint: runRemoteEndpoint
      }
      // pass the LARA info (notably the run_remote_endpoint) to the CFM client
      this.options?.logLaraData?.(laraData)
    }
  }

  async handleRunRemoteEndpoint(initInteractiveMessage: IInitInteractive) {
    if (initInteractiveMessage.mode !== "runtime") {
      return
    }

    // no point in tracking down the run_remote_endpoint if we can't notify the client
    if (!initInteractiveMessage || !this.options?.logLaraData) return

    if (initInteractiveMessage.runRemoteEndpoint) {
      this.logLaraData(initInteractiveMessage.interactiveStateUrl, initInteractiveMessage.runRemoteEndpoint)
    }
    // classInfoUrl is only available for students running while logged in
    else if (initInteractiveMessage.classInfoUrl && initInteractiveMessage.interactiveStateUrl) {
      // extract the run_remote_endpoint from the interactive run state
      // cf. LaraProvider's processInitialRunState() function
      try {
        const response = await fetch(initInteractiveMessage.interactiveStateUrl, { credentials: 'include' })
        if (response.ok) {
          const state = await response.json()
          this.logLaraData(initInteractiveMessage.interactiveStateUrl, state?.run_remote_endpoint)
        }
      }
      catch(e) {
        // ignore errors; if we can't get the state we don't have a runRemoteEndpoint
      }
    }
  }

  async readAttachmentContent(interactiveState: InteractiveStateAttachment, interactiveId?: string) {
    const response = await readAttachment({name: interactiveState.__attachment__, interactiveId})
    if (response.ok) {
      // TODO: Scott suggests reading contentType from response rather than from interactiveState
      return interactiveState.contentType === "application/json" ? response.json() : response.text()
    }
    else {
      throw new Error(`Error reading attachment contents! ["${response.statusText}"]`)
    }
  }

  async processRawInteractiveState(interactiveState: any, interactiveId?: string) {
    return isInteractiveStateAttachment(interactiveState)
            ? await this.readAttachmentContent(interactiveState, interactiveId)
            : cloneDeep(interactiveState)
  }

  // the client uses a callback pattern, so wrap it in an async wrapper
  async selectFromInteractiveStates(props: SelectInteractiveStateDialogProps) {
    return new Promise<{}>((resolve, _reject) => {
      this.client.selectInteractiveStateDialog(props, (selected) => {
        resolve(selected)
      })
    })
  }

  async getInitialInteractiveStateAndinteractiveId(initInteractiveMessage: IInitInteractive): Promise<{interactiveState: {}, interactiveId?: string}> {
    if ((initInteractiveMessage.mode === "authoring") || (initInteractiveMessage.mode === "reportItem")) {
      return null
    }
    if (initInteractiveMessage.mode === "report") {
      return {interactiveState: initInteractiveMessage.interactiveState}
    }

    let interactiveState = initInteractiveMessage.interactiveState

    // some interactives, like the full-screen wrapper always report they are in runtime
    // mode, even when loaded in a report which does not define the interactive member
    let interactiveId = initInteractiveMessage.interactive?.id

    const interactiveStateAvailable = !!interactiveState
    const {allLinkedStates} = initInteractiveMessage

    // this is adapted from the existing autolaunch.ts file
    if (interactiveId && allLinkedStates?.length > 0) {
      // find linked state which is directly linked to this one along with the most recent linked state.
      const directlyLinkedState = allLinkedStates[0]

      let mostRecentLinkedState: IInteractiveStateProps<{}>
      if (directlyLinkedState.updatedAt) {
        mostRecentLinkedState = allLinkedStates.slice().sort((a, b) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })[0]
      } else {
        // currently the AP doesn't make the updatedAt attribute available so just pick the directly linked state
        mostRecentLinkedState = directlyLinkedState
      }

      const currentDataTimestamp = new Date(initInteractiveMessage.updatedAt || Date.now())
      const mostRecentLinkedStateTimestamp = new Date(mostRecentLinkedState.updatedAt || Date.now())
      const directlyLinkedStateTimestamp = new Date(directlyLinkedState.updatedAt ||  Date.now())

      // current state is available, but there's more recent data in one of the linked states. Ask user.
      if (interactiveStateAvailable && mostRecentLinkedStateTimestamp && mostRecentLinkedStateTimestamp > currentDataTimestamp) {
        interactiveState = await this.selectFromInteractiveStates({
          state1: mostRecentLinkedState,
          state2: initInteractiveMessage,
          interactiveStateAvailable
        })

        interactiveId = interactiveState === mostRecentLinkedState.interactiveState
          ? mostRecentLinkedState.interactive.id
          : initInteractiveMessage.interactive.id

        if (interactiveState === mostRecentLinkedState.interactiveState) {
          // remove existing interactive state, so the interactive will be initialized from the linked state next time (if it is not saved).
          await setInteractiveState(null)
        } else {
          // update the current interactive state timestamp so the next reload doesn't trigger this picker UI
          await setInteractiveState("touch")
        }

        return {interactiveState, interactiveId}
      }

      // there's no current state and directly linked interactive isn't the most recent one. Ask user.
      if (!interactiveStateAvailable &&
          directlyLinkedState !== mostRecentLinkedState &&
          directlyLinkedStateTimestamp && mostRecentLinkedStateTimestamp &&
          mostRecentLinkedStateTimestamp > directlyLinkedStateTimestamp) {
        interactiveState = await this.selectFromInteractiveStates({
          state1: mostRecentLinkedState,
          state2: directlyLinkedState,
          interactiveStateAvailable
        })

        interactiveId = interactiveState === mostRecentLinkedState.interactiveState
          ? mostRecentLinkedState.interactive.id
          : directlyLinkedState.interactive.id

          return {interactiveState, interactiveId}
      }

      // there's no current state, but the directly linked state is the most recent one.
      if (!interactiveStateAvailable && directlyLinkedState) {
        interactiveState = directlyLinkedState.interactiveState
        interactiveId = directlyLinkedState.interactive.id

        // save the directly linked state so that it is available with the sharing plugin
        await setInteractiveState(interactiveState)
      }
    }

    return {interactiveState, interactiveId}
  }

  getInteractiveId(initInteractiveMessage: IInitInteractive) {
    return initInteractiveMessage.mode === "runtime" ? initInteractiveMessage.interactive.id : undefined
  }

  async handleInitialInteractiveState(initInteractiveMessage: IInitInteractive) {
    let interactiveState: any

    const {interactiveState: initialInteractiveState, interactiveId} = await this.getInitialInteractiveStateAndinteractiveId(initInteractiveMessage)

    try {
      interactiveState = await this.processRawInteractiveState(initialInteractiveState, interactiveId)
    }
    catch(e) {
      // on initial interactive state there's not much we can do on error besides ignore it
    }
    const providerParams: InteractiveApiProviderParams = {
      // documentId is used to load initial state from shared document
      documentId: queryString.parse(location.search).documentId as string,
      // interactive state is used all other times; undefined => empty document
      interactiveState
    }
    this.client.openProviderFileWhenConnected(this.name, providerParams)
  }

  handleInitInteractive() {
    this.readyPromise = new Promise(resolve => {
      this.getInitInteractiveMessage().then(initInteractiveMessage => {
        // save it to the client internal state to avoid having to wait again during initial load
        // the second wait caused the tests to fail and this is needed when loading the provider
        // file to get the host domain
        this.initInteractiveMessage = initInteractiveMessage

        Promise.all([
          this.handleRunRemoteEndpoint(initInteractiveMessage),
          this.handleInitialInteractiveState(initInteractiveMessage)
        ]).then (() => resolve(true))
      })
    })
  }

  handleUrlParams() {
    const params = queryString.parse(location.search)
    // can have a value or be null (present without a value)
    if (params.interactiveApi !== undefined) {
      return true
    }
  }

  // don't show in provider open/save dialogs
  filterTabComponent(capability: ECapabilities, defaultComponent: React.Component): React.Component | null {
    return null
  }

  async load(metadata: CloudMetadata, callback: ProviderLoadCallback) {
    const initInteractiveMessage = await this.getInitInteractiveMessage()
    try {
      const interactiveId = this.getInteractiveId(initInteractiveMessage)
      const interactiveState = this.rewriteInteractiveState(await this.processRawInteractiveState(await getInteractiveState(), interactiveId))
      // following the example of the LaraProvider, wrap the content in a CFM envelope
      const content = cloudContentFactory.createEnvelopedCloudContent(interactiveState)
      callback(null, content, metadata)
    }
    catch(e) {
      callback(e.message)
    }
  }

  async save(cloudContent: any, metadata: CloudMetadata, callback?: ProviderSaveCallback, disablePatch?: boolean) {
    await this.getInitInteractiveMessage()
    const newState = cloudContent.getContent()
    const result = await setInteractiveState(newState)
    if (result.error) {
      callback?.(result.error)
    } else {
      callback?.(null, 200, newState)
    }
  }

  canOpenSaved() { return true }

  getOpenSavedParams(metadata: CloudMetadata) {
    return metadata.providerData
  }

  async openSaved(openSavedParams: InteractiveApiProviderParams, callback: ProviderOpenCallback) {
    const { interactiveState: initialInteractiveState, ...otherParams } = openSavedParams

    // trigger appropriate CFM notifications
    const successCallback = (state: any) => {
      const content = cloudContentFactory.createEnvelopedCloudContent(state)
      const metadata = new CloudMetadata({
        type: CloudMetadata.File,
        provider: this,
        providerData: otherParams
      })
      callback(null, content, metadata)
    }

    // if we have an initial state, then use it
    // under some circumstances (e.g. prior failure to save an attachment?), the
    // initialInteractiveState is reported as an empty object, which is not considered
    // valid for these purposes
    if (initialInteractiveState != null && !isEmptyObject(initialInteractiveState)) {
      successCallback(this.rewriteInteractiveState(initialInteractiveState))
    }
    // otherwise, load the initial state from its document id (url)
    else if (openSavedParams.documentId) {
      try {
        const response = await fetch(openSavedParams.documentId)
        const interactiveState = this.rewriteInteractiveState(response.ok ? await response.json() : undefined)
        if (interactiveState) {
          // initialize our interactive state from the shared document contents
          const result = await setInteractiveState(interactiveState)
          if (result.error) {
            callback(result.error)
          } else {
            successCallback(interactiveState)
          }
        }
        return
      }
      catch(e) {
        // ignore errors
      }
      callback(`Unable to open saved document: ${openSavedParams.documentId}!`)
    }
    else {
      // in the absence of any provided content, initialize with an empty string
      await setInteractiveState("")
      // notify that we have new state
      successCallback("")
    }
  }

  private rewriteInteractiveState(interactiveState?: any) {
    if (interactiveState && this.isObject(interactiveState)) {
      const hostDomain = this.initInteractiveMessage?.hostFeatures?.domain
      if (hostDomain) {
        // rewrite any sensor-interactive urls to the host domain
        this.rewriteSensorInteractiveUrls(interactiveState, hostDomain)
      }
    }
    return interactiveState
  }

  private isObject(value: any) {
    return !!(value && typeof value === "object")
  }

  private rewriteSensorInteractiveUrls(obj: any, hostDomain: string) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.rewriteSensorInteractiveUrls(item, hostDomain)
      }
    } else if (this.isObject(obj)) {
      for (const key in obj) {
        const value = obj[key]
        if (typeof value === "string") {
          const matches = value.trim().match(/^(https?:\/\/)([^\/]+)(\/sensor-interactive\/.*)$/)
          if (matches) {
            obj[key] = `${matches[1]}${hostDomain}${matches[3]}`
          }
        } else if (this.isObject(value) || Array.isArray(value)) {
          this.rewriteSensorInteractiveUrls(value, hostDomain)
        }
      }
    }
  }
}

export default InteractiveApiProvider
