var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/@openim/wasm-client-sdk/lib/index.es.js
function isWorker() {
  return typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
}
function makeStartWorkerFromMain(getModule) {
  return (argBuffer, resultBuffer, parentWorker) => {
    if (isWorker()) {
      throw new Error(
        "`startWorkerFromMain` should only be called from the main thread"
      );
    }
    if (typeof Worker === "undefined") {
      throw new Error(
        "Web workers not available. sqlite3 requires web workers to work."
      );
    }
    getModule().then(({ default: BackendWorker }) => {
      let worker2 = new BackendWorker();
      worker2.postMessage({ type: "init", buffers: [argBuffer, resultBuffer] });
      worker2.addEventListener("message", (msg) => {
        parentWorker.postMessage(msg.data);
      });
    });
  };
}
function makeInitBackend(spawnEventName, getModule) {
  const startWorkerFromMain = makeStartWorkerFromMain(getModule);
  return (worker2) => {
    worker2.addEventListener("message", (e) => {
      switch (e.data.type) {
        case spawnEventName:
          startWorkerFromMain(e.data.argBuffer, e.data.resultBuffer, worker2);
          break;
      }
    });
  };
}
function supportsModuleWorkers() {
  if (typeof Worker !== "undefined" && "type" in Worker.prototype) {
    return true;
  }
  try {
    const blob = new Blob([""], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    new Worker(url, { type: "module" });
    URL.revokeObjectURL(url);
    return true;
  } catch (e) {
    return false;
  }
}
function initWorker() {
  if (typeof window === "undefined") {
    return;
  }
  const isViteEnvironment = import.meta.url.includes(".vite/deps");
  const isNuxtEnvironment = import.meta.url.includes("_nuxt/node_modules");
  const isQuasarEnvironment = import.meta.url.includes(".q-cache");
  const isSupportModuleWorker = supportsModuleWorkers();
  let workerUrl = isSupportModuleWorker ? new URL("worker.js", import.meta.url) : new URL("worker-legacy.js", import.meta.url);
  if (isViteEnvironment) {
    workerUrl = workerUrl.href.replace(".vite/deps", "@openim/wasm-client-sdk/lib");
  }
  if (isNuxtEnvironment) {
    workerUrl = workerUrl.href.replace(".cache/vite/client/deps", "@openim/wasm-client-sdk/lib");
  }
  if (isQuasarEnvironment) {
    workerUrl = workerUrl.href.replace(/\.q-cache\/dev-spa\/[^/]+\/deps/, "@openim/wasm-client-sdk/lib");
  }
  worker = new Worker(workerUrl, {
    type: isSupportModuleWorker ? "module" : "classic"
  });
  initBackend(worker);
  rpc = new RPC({
    event: new RPCMessageEvent({
      currentEndpoint: worker,
      targetEndpoint: worker
    })
  });
}
function resetWorker() {
  if (rpc) {
    rpc.destroy();
    rpc = void 0;
  }
  if (worker) {
    worker.terminate();
    worker = void 0;
  }
}
function catchErrorHandle(error) {
  if (error.code === -32300) {
    resetWorker();
    return JSON.stringify({
      data: "",
      errCode: DatabaseErrorCode.OperationTimedOut,
      errMsg: "database maybe damaged"
    });
  }
  throw error;
}
function _logWrap(...args) {
  if (debug) {
    console.info(...args);
  }
}
function registeMethodOnWindow(name, realName, needStringify = true) {
  _logWrap(`=> (database api) registe ${realName !== null && realName !== void 0 ? realName : name}`);
  return async (...args) => {
    if (!rpc || !worker) {
      initWorker();
    }
    if (!rpc) {
      return;
    }
    try {
      _logWrap(`=> (invoked by go wasm) run ${realName !== null && realName !== void 0 ? realName : name} method with args ${JSON.stringify(args)}`);
      const response = await rpc.invoke(name, ...args, {
        timeout: DATABASE_RPC_TIMEOUT_MS
      });
      _logWrap(`=> (invoked by go wasm) run ${realName !== null && realName !== void 0 ? realName : name} method with response `, JSON.stringify(response));
      if (!needStringify) {
        return response;
      }
      return JSON.stringify(response);
    } catch (error) {
      return catchErrorHandle(error);
    }
  };
}
function initDatabaseAPI(isLogStandardOutput = true) {
  if (!rpc) {
    return;
  }
  debug = isLogStandardOutput;
  window.wasmOpen = registeMethodOnWindow("wasmOpen");
  window.wasmClose = registeMethodOnWindow("wasmClose");
  window.wasmRead = registeMethodOnWindow("wasmRead", "wasmRead", false);
  window.getUpload = registeMethodOnWindow("getUpload");
  window.insertUpload = registeMethodOnWindow("insertUpload");
  window.updateUpload = registeMethodOnWindow("updateUpload");
  window.deleteUpload = registeMethodOnWindow("deleteUpload");
  window.deleteExpireUpload = registeMethodOnWindow("deleteExpireUpload");
  window.fileMapSet = registeMethodOnWindow("fileMapSet");
  window.fileMapClear = registeMethodOnWindow("fileMapClear");
  window.setSqlWasmPath = registeMethodOnWindow("setSqlWasmPath");
  window.initDB = registeMethodOnWindow("initDB");
  window.closeDB = registeMethodOnWindow("closeDB");
  window.getMessage = registeMethodOnWindow("getMessage");
  window.getMultipleMessage = registeMethodOnWindow("getMultipleMessage");
  window.getSendingMessageList = registeMethodOnWindow("getSendingMessageList");
  window.getNormalMsgSeq = registeMethodOnWindow("getNormalMsgSeq");
  window.updateMessageTimeAndStatus = registeMethodOnWindow("updateMessageTimeAndStatus");
  window.updateMessage = registeMethodOnWindow("updateMessage");
  window.updateMessageBySeq = registeMethodOnWindow("updateMessageBySeq");
  window.updateColumnsMessage = registeMethodOnWindow("updateColumnsMessage");
  window.insertMessage = registeMethodOnWindow("insertMessage");
  window.batchInsertMessageList = registeMethodOnWindow("batchInsertMessageList");
  window.getMessageList = registeMethodOnWindow("getMessageList");
  window.getMessageListNoTime = registeMethodOnWindow("getMessageListNoTime");
  window.messageIfExists = registeMethodOnWindow("messageIfExists");
  window.messageIfExistsBySeq = registeMethodOnWindow("messageIfExistsBySeq");
  window.getAbnormalMsgSeq = registeMethodOnWindow("getAbnormalMsgSeq");
  window.getAbnormalMsgSeqList = registeMethodOnWindow("getAbnormalMsgSeqList");
  window.batchInsertExceptionMsg = registeMethodOnWindow("batchInsertExceptionMsg");
  window.searchMessageByKeyword = registeMethodOnWindow("searchMessageByKeyword");
  window.searchMessageByContentType = registeMethodOnWindow("searchMessageByContentType");
  window.searchMessageByContentTypeAndKeyword = registeMethodOnWindow("searchMessageByContentTypeAndKeyword");
  window.updateMsgSenderNickname = registeMethodOnWindow("updateMsgSenderNickname");
  window.updateMsgSenderFaceURL = registeMethodOnWindow("updateMsgSenderFaceURL");
  window.updateMsgSenderFaceURLAndSenderNickname = registeMethodOnWindow("updateMsgSenderFaceURLAndSenderNickname");
  window.getMsgSeqByClientMsgID = registeMethodOnWindow("getMsgSeqByClientMsgID");
  window.getMsgSeqListByGroupID = registeMethodOnWindow("getMsgSeqListByGroupID");
  window.getMsgSeqListByPeerUserID = registeMethodOnWindow("getMsgSeqListByPeerUserID");
  window.getMsgSeqListBySelfUserID = registeMethodOnWindow("getMsgSeqListBySelfUserID");
  window.deleteAllMessage = registeMethodOnWindow("deleteAllMessage");
  window.getAllUnDeleteMessageSeqList = registeMethodOnWindow("getAllUnDeleteMessageSeqList");
  window.updateSingleMessageHasRead = registeMethodOnWindow("updateSingleMessageHasRead");
  window.updateGroupMessageHasRead = registeMethodOnWindow("updateGroupMessageHasRead");
  window.updateMessageStatusBySourceID = registeMethodOnWindow("updateMessageStatusBySourceID");
  window.getAlreadyExistSeqList = registeMethodOnWindow("getAlreadyExistSeqList");
  window.getLatestValidServerMessage = registeMethodOnWindow("getLatestValidServerMessage");
  window.getMessageBySeq = registeMethodOnWindow("getMessageBySeq");
  window.getMessagesByClientMsgIDs = registeMethodOnWindow("getMessagesByClientMsgIDs");
  window.getMessagesBySeqs = registeMethodOnWindow("getMessagesBySeqs");
  window.getConversationNormalMsgSeq = registeMethodOnWindow("getConversationNormalMsgSeq");
  window.checkConversationNormalMsgSeq = registeMethodOnWindow("getConversationNormalMsgSeq");
  window.getConversationPeerNormalMsgSeq = registeMethodOnWindow("getConversationPeerNormalMsgSeq");
  window.deleteConversationAllMessages = registeMethodOnWindow("deleteConversationAllMessages");
  window.markDeleteConversationAllMessages = registeMethodOnWindow("markDeleteConversationAllMessages");
  window.cleanDuplicateInvalidMessages = registeMethodOnWindow("cleanDuplicateInvalidMessages");
  window.getUnreadMessage = registeMethodOnWindow("getUnreadMessage");
  window.markConversationMessageAsReadBySeqs = registeMethodOnWindow("markConversationMessageAsReadBySeqs");
  window.markConversationMessageAsReadDB = registeMethodOnWindow("markConversationMessageAsRead");
  window.deleteConversationMsgs = registeMethodOnWindow("deleteConversationMsgs");
  window.markConversationAllMessageAsRead = registeMethodOnWindow("markConversationAllMessageAsRead");
  window.searchAllMessageByContentType = registeMethodOnWindow("searchAllMessageByContentType");
  window.insertSendingMessage = registeMethodOnWindow("insertSendingMessage");
  window.deleteSendingMessage = registeMethodOnWindow("deleteSendingMessage");
  window.getAllSendingMessages = registeMethodOnWindow("getAllSendingMessages");
  window.getAllConversationListDB = registeMethodOnWindow("getAllConversationList");
  window.getAllConversationListToSync = registeMethodOnWindow("getAllConversationListToSync");
  window.getHiddenConversationList = registeMethodOnWindow("getHiddenConversationList");
  window.getConversation = registeMethodOnWindow("getConversation");
  window.getMultipleConversationDB = registeMethodOnWindow("getMultipleConversation");
  window.updateColumnsConversation = registeMethodOnWindow("updateColumnsConversation");
  window.updateConversation = registeMethodOnWindow("updateColumnsConversation", "updateConversation");
  window.updateConversationForSync = registeMethodOnWindow("updateColumnsConversation", "updateConversationForSync");
  window.decrConversationUnreadCount = registeMethodOnWindow("decrConversationUnreadCount");
  window.batchInsertConversationList = registeMethodOnWindow("batchInsertConversationList");
  window.insertConversation = registeMethodOnWindow("insertConversation");
  window.getTotalUnreadMsgCountDB = registeMethodOnWindow("getTotalUnreadMsgCount");
  window.getConversationByUserID = registeMethodOnWindow("getConversationByUserID");
  window.getConversationListSplitDB = registeMethodOnWindow("getConversationListSplit");
  window.deleteConversation = registeMethodOnWindow("deleteConversation");
  window.deleteAllConversation = registeMethodOnWindow("deleteAllConversation");
  window.batchUpdateConversationList = registeMethodOnWindow("batchUpdateConversationList");
  window.conversationIfExists = registeMethodOnWindow("conversationIfExists");
  window.resetConversation = registeMethodOnWindow("resetConversation");
  window.resetAllConversation = registeMethodOnWindow("resetAllConversation");
  window.clearConversation = registeMethodOnWindow("clearConversation");
  window.clearAllConversation = registeMethodOnWindow("clearAllConversation");
  window.setConversationDraftDB = registeMethodOnWindow("setConversationDraft");
  window.removeConversationDraft = registeMethodOnWindow("removeConversationDraft");
  window.unPinConversation = registeMethodOnWindow("unPinConversation");
  window.updateAllConversation = registeMethodOnWindow("updateAllConversation");
  window.updateOrCreateConversations = registeMethodOnWindow("updateOrCreateConversations");
  window.incrConversationUnreadCount = registeMethodOnWindow("incrConversationUnreadCount");
  window.setMultipleConversationRecvMsgOpt = registeMethodOnWindow("setMultipleConversationRecvMsgOpt");
  window.getAllSingleConversationIDList = registeMethodOnWindow("getAllSingleConversationIDList");
  window.findAllUnreadConversationConversationID = registeMethodOnWindow("findAllUnreadConversationConversationID");
  window.getAllConversationIDList = registeMethodOnWindow("getAllConversationIDList");
  window.getAllConversations = registeMethodOnWindow("getAllConversations");
  window.searchConversations = registeMethodOnWindow("searchConversations");
  window.getLatestActiveMessage = registeMethodOnWindow("getLatestActiveMessage");
  window.getLoginUser = registeMethodOnWindow("getLoginUser");
  window.insertLoginUser = registeMethodOnWindow("insertLoginUser");
  window.updateLoginUser = registeMethodOnWindow("updateLoginUser");
  window.updateLoginUserByMap = registeMethodOnWindow("updateLoginUserByMap");
  window.processUserCommandGetAll = registeMethodOnWindow("processUserCommandGetAll");
  window.processUserCommandAdd = registeMethodOnWindow("processUserCommandAdd");
  window.processUserCommandUpdate = registeMethodOnWindow("processUserCommandUpdate");
  window.processUserCommandDelete = registeMethodOnWindow("processUserCommandDelete");
  window.getStrangerInfo = registeMethodOnWindow("getStrangerInfo");
  window.setStrangerInfo = registeMethodOnWindow("setStrangerInfo");
  window.getAppSDKVersion = registeMethodOnWindow("getAppSDKVersion");
  window.setAppSDKVersion = registeMethodOnWindow("setAppSDKVersion");
  window.getVersionSync = registeMethodOnWindow("getVersionSync");
  window.setVersionSync = registeMethodOnWindow("setVersionSync");
  window.deleteVersionSync = registeMethodOnWindow("deleteVersionSync");
  window.getJoinedSuperGroupList = registeMethodOnWindow("getJoinedSuperGroupList");
  window.getJoinedSuperGroupIDList = registeMethodOnWindow("getJoinedSuperGroupIDList");
  window.getSuperGroupInfoByGroupID = registeMethodOnWindow("getSuperGroupInfoByGroupID");
  window.deleteSuperGroup = registeMethodOnWindow("deleteSuperGroup");
  window.insertSuperGroup = registeMethodOnWindow("insertSuperGroup");
  window.updateSuperGroup = registeMethodOnWindow("updateSuperGroup");
  window.deleteConversationUnreadMessageList = registeMethodOnWindow("deleteConversationUnreadMessageList");
  window.batchInsertConversationUnreadMessageList = registeMethodOnWindow("batchInsertConversationUnreadMessageList");
  window.superGroupGetMessage = registeMethodOnWindow("superGroupGetMessage");
  window.superGroupGetMultipleMessage = registeMethodOnWindow("superGroupGetMultipleMessage");
  window.superGroupGetNormalMinSeq = registeMethodOnWindow("superGroupGetNormalMinSeq");
  window.getSuperGroupNormalMsgSeq = registeMethodOnWindow("getSuperGroupNormalMsgSeq");
  window.superGroupUpdateMessageTimeAndStatus = registeMethodOnWindow("superGroupUpdateMessageTimeAndStatus");
  window.superGroupUpdateMessage = registeMethodOnWindow("superGroupUpdateMessage");
  window.superGroupInsertMessage = registeMethodOnWindow("superGroupInsertMessage");
  window.superGroupBatchInsertMessageList = registeMethodOnWindow("superGroupBatchInsertMessageList");
  window.superGroupGetMessageListNoTime = registeMethodOnWindow("superGroupGetMessageListNoTime");
  window.superGroupGetMessageList = registeMethodOnWindow("superGroupGetMessageList");
  window.superGroupUpdateColumnsMessage = registeMethodOnWindow("superGroupUpdateColumnsMessage");
  window.superGroupDeleteAllMessage = registeMethodOnWindow("superGroupDeleteAllMessage");
  window.superGroupSearchMessageByKeyword = registeMethodOnWindow("superGroupSearchMessageByKeyword");
  window.superGroupSearchMessageByContentType = registeMethodOnWindow("superGroupSearchMessageByContentType");
  window.superGroupSearchMessageByContentTypeAndKeyword = registeMethodOnWindow("superGroupSearchMessageByContentTypeAndKeyword");
  window.superGroupUpdateMessageStatusBySourceID = registeMethodOnWindow("superGroupUpdateMessageStatusBySourceID");
  window.superGroupGetSendingMessageList = registeMethodOnWindow("superGroupGetSendingMessageList");
  window.superGroupUpdateGroupMessageHasRead = registeMethodOnWindow("superGroupUpdateGroupMessageHasRead");
  window.superGroupGetMsgSeqByClientMsgID = registeMethodOnWindow("superGroupGetMsgSeqByClientMsgID");
  window.superGroupUpdateMsgSenderFaceURLAndSenderNickname = registeMethodOnWindow("superGroupUpdateMsgSenderFaceURLAndSenderNickname");
  window.superGroupSearchAllMessageByContentType = registeMethodOnWindow("superGroupSearchAllMessageByContentType");
  window.exec = registeMethodOnWindow("exec");
  window.getRowsModified = registeMethodOnWindow("getRowsModified");
  window.exportDB = async () => {
    if (!rpc || !worker) {
      initWorker();
    }
    if (!rpc) {
      return;
    }
    try {
      _logWrap("=> (invoked by go wasm) run exportDB method ");
      const result = await rpc.invoke("exportDB", void 0, { timeout: 5e3 });
      _logWrap("=> (invoked by go wasm) run exportDB method with response ", JSON.stringify(result));
      return result;
    } catch (error) {
      catchErrorHandle(error);
    }
  };
  window.getBlackListDB = registeMethodOnWindow("getBlackList");
  window.getBlackListUserID = registeMethodOnWindow("getBlackListUserID");
  window.getBlackInfoByBlockUserID = registeMethodOnWindow("getBlackInfoByBlockUserID");
  window.getBlackInfoList = registeMethodOnWindow("getBlackInfoList");
  window.insertBlack = registeMethodOnWindow("insertBlack");
  window.deleteBlack = registeMethodOnWindow("deleteBlack");
  window.updateBlack = registeMethodOnWindow("updateBlack");
  window.insertFriendRequest = registeMethodOnWindow("insertFriendRequest");
  window.deleteFriendRequestBothUserID = registeMethodOnWindow("deleteFriendRequestBothUserID");
  window.updateFriendRequest = registeMethodOnWindow("updateFriendRequest");
  window.getRecvFriendApplication = registeMethodOnWindow("getRecvFriendApplication");
  window.getSendFriendApplication = registeMethodOnWindow("getSendFriendApplication");
  window.getFriendApplicationByBothID = registeMethodOnWindow("getFriendApplicationByBothID");
  window.getBothFriendReq = registeMethodOnWindow("getBothFriendReq");
  window.insertFriend = registeMethodOnWindow("insertFriend");
  window.deleteFriendDB = registeMethodOnWindow("deleteFriend");
  window.updateFriend = registeMethodOnWindow("updateFriend");
  window.getAllFriendList = registeMethodOnWindow("getAllFriendList");
  window.searchFriendList = registeMethodOnWindow("searchFriendList");
  window.getFriendInfoByFriendUserID = registeMethodOnWindow("getFriendInfoByFriendUserID");
  window.getFriendInfoList = registeMethodOnWindow("getFriendInfoList");
  window.getPageFriendList = registeMethodOnWindow("getPageFriendList");
  window.updateColumnsFriend = registeMethodOnWindow("updateColumnsFriend");
  window.getFriendListCount = registeMethodOnWindow("getFriendListCount");
  window.batchInsertFriend = registeMethodOnWindow("batchInsertFriend");
  window.deleteAllFriend = registeMethodOnWindow("deleteAllFriend");
  window.insertGroup = registeMethodOnWindow("insertGroup");
  window.deleteGroup = registeMethodOnWindow("deleteGroup");
  window.updateGroup = registeMethodOnWindow("updateGroup");
  window.getJoinedGroupListDB = registeMethodOnWindow("getJoinedGroupList");
  window.getGroupInfoByGroupID = registeMethodOnWindow("getGroupInfoByGroupID");
  window.getAllGroupInfoByGroupIDOrGroupName = registeMethodOnWindow("getAllGroupInfoByGroupIDOrGroupName");
  window.subtractMemberCount = registeMethodOnWindow("subtractMemberCount");
  window.addMemberCount = registeMethodOnWindow("addMemberCount");
  window.getJoinedWorkingGroupIDList = registeMethodOnWindow("getJoinedWorkingGroupIDList");
  window.getJoinedWorkingGroupList = registeMethodOnWindow("getJoinedWorkingGroupList");
  window.getGroupMemberAllGroupIDs = registeMethodOnWindow("getGroupMemberAllGroupIDs");
  window.getUserJoinedGroupIDs = registeMethodOnWindow("getUserJoinedGroupIDs");
  window.getGroups = registeMethodOnWindow("getGroups");
  window.getGroupMemberListByUserIDs = registeMethodOnWindow("getGroupMemberListByUserIDs");
  window.batchInsertGroup = registeMethodOnWindow("batchInsertGroup");
  window.deleteAllGroup = registeMethodOnWindow("deleteAllGroup");
  window.insertGroupRequest = registeMethodOnWindow("insertGroupRequest");
  window.deleteGroupRequest = registeMethodOnWindow("deleteGroupRequest");
  window.updateGroupRequest = registeMethodOnWindow("updateGroupRequest");
  window.getSendGroupApplication = registeMethodOnWindow("getSendGroupApplication");
  window.insertAdminGroupRequest = registeMethodOnWindow("insertAdminGroupRequest");
  window.deleteAdminGroupRequest = registeMethodOnWindow("deleteAdminGroupRequest");
  window.updateAdminGroupRequest = registeMethodOnWindow("updateAdminGroupRequest");
  window.getAdminGroupApplication = registeMethodOnWindow("getAdminGroupApplication");
  window.getGroupMemberInfoByGroupIDUserID = registeMethodOnWindow("getGroupMemberInfoByGroupIDUserID");
  window.getAllGroupMemberList = registeMethodOnWindow("getAllGroupMemberList");
  window.getAllGroupMemberUserIDList = registeMethodOnWindow("getAllGroupMemberUserIDList");
  window.getGroupMemberCount = registeMethodOnWindow("getGroupMemberCount");
  window.getGroupSomeMemberInfo = registeMethodOnWindow("getGroupSomeMemberInfo");
  window.getGroupAdminID = registeMethodOnWindow("getGroupAdminID");
  window.getGroupMemberListByGroupID = registeMethodOnWindow("getGroupMemberListByGroupID");
  window.getGroupMemberListSplit = registeMethodOnWindow("getGroupMemberListSplit");
  window.getGroupMemberOwnerAndAdminDB = registeMethodOnWindow("getGroupMemberOwnerAndAdmin");
  window.getGroupMemberOwner = registeMethodOnWindow("getGroupMemberOwner");
  window.getGroupMemberListSplitByJoinTimeFilter = registeMethodOnWindow("getGroupMemberListSplitByJoinTimeFilter");
  window.getGroupOwnerAndAdminByGroupID = registeMethodOnWindow("getGroupOwnerAndAdminByGroupID");
  window.getGroupMemberUIDListByGroupID = registeMethodOnWindow("getGroupMemberUIDListByGroupID");
  window.insertGroupMember = registeMethodOnWindow("insertGroupMember");
  window.batchInsertGroupMember = registeMethodOnWindow("batchInsertGroupMember");
  window.deleteGroupMember = registeMethodOnWindow("deleteGroupMember");
  window.deleteGroupAllMembers = registeMethodOnWindow("deleteGroupAllMembers");
  window.updateGroupMember = registeMethodOnWindow("updateGroupMember");
  window.updateGroupMemberField = registeMethodOnWindow("updateGroupMemberField");
  window.searchGroupMembersDB = registeMethodOnWindow("searchGroupMembers", "searchGroupMembersDB");
  window.batchInsertTempCacheMessageList = registeMethodOnWindow("batchInsertTempCacheMessageList");
  window.InsertTempCacheMessage = registeMethodOnWindow("InsertTempCacheMessage");
  window.getNotificationAllSeqs = registeMethodOnWindow("getNotificationAllSeqs");
  window.setNotificationSeq = registeMethodOnWindow("setNotificationSeq");
  window.batchInsertNotificationSeq = registeMethodOnWindow("batchInsertNotificationSeq");
  window.getExistedTables = registeMethodOnWindow("getExistedTables");
  window.getExistTables = registeMethodOnWindow("getExistTables");
}
function rng() {
  if (!getRandomValues) {
    getRandomValues = typeof crypto !== "undefined" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto);
    if (!getRandomValues) {
      throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
    }
  }
  return getRandomValues(rnds8);
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
function v4(options, buf, offset) {
  if (native.randomUUID && !buf && !options) {
    return native.randomUUID();
  }
  options = options || {};
  const rnds = options.random || (options.rng || rng)();
  rnds[6] = rnds[6] & 15 | 64;
  rnds[8] = rnds[8] & 63 | 128;
  if (buf) {
    offset = offset || 0;
    for (let i = 0; i < 16; ++i) {
      buf[offset + i] = rnds[i];
    }
    return buf;
  }
  return unsafeStringify(rnds);
}
async function wait(duration) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve(null);
    }, duration);
  });
}
function logBoxStyleValue(backgroundColor, color) {
  return `font-size:14px; background:${backgroundColor !== null && backgroundColor !== void 0 ? backgroundColor : "#ffffff"}; color:${color !== null && color !== void 0 ? color : "#000000"}; border-radius:4px; padding-inline:4px;`;
}
async function initializeWasm(url) {
  if (initialized) {
    return null;
  }
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  go = new Go();
  let wasm;
  try {
    if ("instantiateStreaming" in WebAssembly) {
      wasm = await WebAssembly.instantiateStreaming(fetchWithCache(url), go.importObject);
    } else {
      const bytes = await fetchWithCache(url).then((resp) => resp.arrayBuffer());
      wasm = await WebAssembly.instantiate(bytes, go.importObject);
    }
    go.run(wasm.instance);
  } catch (error) {
    console.error("Failed to initialize WASM:", error);
    return null;
  }
  await wait(100);
  for (const exportName of UNEXPOSED_WASM_EXPORTS) {
    Reflect.deleteProperty(window, exportName);
  }
  initialized = true;
  return go;
}
function getGO() {
  return go;
}
function getGoExitPromise() {
  return goExitPromise;
}
async function fetchWithCache(url) {
  if (!("caches" in window)) {
    return fetch(url);
  }
  const isResourceUpdated = async () => {
    const serverResponse = await fetch(url, { method: "HEAD" });
    const etag = serverResponse.headers.get("ETag");
    const lastModified = serverResponse.headers.get("Last-Modified");
    return serverResponse.ok && (etag !== (cachedResponse === null || cachedResponse === void 0 ? void 0 : cachedResponse.headers.get("ETag")) || lastModified !== (cachedResponse === null || cachedResponse === void 0 ? void 0 : cachedResponse.headers.get("Last-Modified")));
  };
  const cache = await caches.open(CACHE_KEY);
  const cachedResponse = await cache.match(url);
  if (cachedResponse && !await isResourceUpdated()) {
    return cachedResponse;
  }
  return fetchAndUpdateCache(url, cache);
}
async function fetchAndUpdateCache(url, cache) {
  const response = await fetch(url, { cache: "no-cache" });
  try {
    await cache.put(url, response.clone());
  } catch (error) {
    console.warn("Failed to put cache");
  }
  return response;
}
function getSDK(config) {
  const { sqlWasmPath, coreWasmPath = "/openIM.wasm", debug: debug2 = true } = config || {};
  if (typeof window === "undefined") {
    return {};
  }
  if (instance) {
    return instance;
  }
  instance = new WasmSdk(coreWasmPath, debug2);
  if (sqlWasmPath) {
    window.setSqlWasmPath(sqlWasmPath);
  }
  return instance;
}
function decodeBase64(base64, enableUnicode) {
  var binaryString = atob(base64);
  if (enableUnicode) {
    var binaryView = new Uint8Array(binaryString.length);
    for (var i = 0, n = binaryString.length; i < n; ++i) {
      binaryView[i] = binaryString.charCodeAt(i);
    }
    return String.fromCharCode.apply(null, new Uint16Array(binaryView.buffer));
  }
  return binaryString;
}
function createURL(base64, sourcemapArg, enableUnicodeArg) {
  var sourcemap = sourcemapArg === void 0 ? null : sourcemapArg;
  var enableUnicode = enableUnicodeArg === void 0 ? false : enableUnicodeArg;
  var source = decodeBase64(base64, enableUnicode);
  var start = source.indexOf("\n", 10) + 1;
  var body = source.substring(start) + (sourcemap ? "//# sourceMappingURL=" + sourcemap : "");
  var blob = new Blob([body], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
function createBase64WorkerFactory(base64, sourcemapArg, enableUnicodeArg) {
  var url;
  return function WorkerFactory2(options) {
    url = url || createURL(base64, sourcemapArg, enableUnicodeArg);
    return new Worker(url, options);
  };
}
var initBackend, __defProp, __defProps, __getOwnPropDescs, __getOwnPropSymbols, __hasOwnProp, __propIsEnum, __defNormalProp, __spreadValues, __spreadProps, __publicField, RPCCodes, RPCMessageEvent, _RPC, RPC, DatabaseErrorCode, SdkEvent, CbEvents, rpc, worker, debug, DATABASE_RPC_TIMEOUT_MS, workerPromise, Emitter, getRandomValues, rnds8, byteToHex, randomUUID, native, initialized, go, goExitPromise, CACHE_KEY, UNEXPOSED_WASM_EXPORTS, WasmSdk, instance, MessageReceiveOption, AddFriendPermission, AllowType, GroupType, GroupJoinSource, GroupMemberRole, GroupVerificationType, MessageStatus, Platform, LogLevel, ApplicationHandleResult, MessageType, SessionType, GroupStatus, GroupMentionType, GroupMemberFilter, Relationship, LoginStatus, OnlineState, GroupMessageReaderFilter, MessageViewType, WorkerFactory, indexeddbMainThreadWorkerB24e7a21;
var init_index_es = __esm({
  "node_modules/@openim/wasm-client-sdk/lib/index.es.js"() {
    initBackend = makeInitBackend(
      "__absurd:spawn-idb-worker",
      () => Promise.resolve().then(function() {
        return indexeddbMainThreadWorkerB24e7a21;
      })
    );
    __defProp = Object.defineProperty;
    __defProps = Object.defineProperties;
    __getOwnPropDescs = Object.getOwnPropertyDescriptors;
    __getOwnPropSymbols = Object.getOwnPropertySymbols;
    __hasOwnProp = Object.prototype.hasOwnProperty;
    __propIsEnum = Object.prototype.propertyIsEnumerable;
    __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
    __spreadValues = (a, b) => {
      for (var prop in b || (b = {}))
        if (__hasOwnProp.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      if (__getOwnPropSymbols)
        for (var prop of __getOwnPropSymbols(b)) {
          if (__propIsEnum.call(b, prop))
            __defNormalProp(a, prop, b[prop]);
        }
      return a;
    };
    __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
    __publicField = (obj, key, value) => {
      __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
      return value;
    };
    RPCCodes = {
      CONNECT_TIMEOUT: {
        code: -32300,
        message: "Connect timeout"
      },
      APPLICATION_ERROR: {
        code: -32500,
        message: "Application error"
      },
      METHOD_NOT_FOUND: {
        code: -32601,
        message: `Method not found`
      }
    };
    RPCMessageEvent = class {
      constructor(options) {
        __publicField(this, "_currentEndpoint");
        __publicField(this, "_targetEndpoint");
        __publicField(this, "_events");
        __publicField(this, "_originOnmessage");
        __publicField(this, "_receiveMessage");
        __publicField(this, "onerror", null);
        __publicField(this, "config");
        __publicField(this, "sendAdapter");
        __publicField(this, "receiveAdapter");
        this._events = {};
        this._currentEndpoint = options.currentEndpoint;
        this._targetEndpoint = options.targetEndpoint;
        this._originOnmessage = null;
        this.config = options.config;
        this.receiveAdapter = options.receiveAdapter;
        this.sendAdapter = options.sendAdapter;
        const receiveMessage = (event) => {
          const receiveData = this.receiveAdapter ? this.receiveAdapter(event) : event.data;
          if (receiveData && typeof receiveData.event === "string") {
            const eventHandlers = this._events[receiveData.event] || [];
            if (eventHandlers.length) {
              eventHandlers.forEach((handler) => {
                handler(...receiveData.args || []);
              });
              return;
            }
            if (this.onerror) {
              this.onerror(__spreadProps(__spreadValues({}, RPCCodes.METHOD_NOT_FOUND), {
                data: receiveData
              }));
            }
          }
        };
        if (this._currentEndpoint.addEventListener) {
          if ("start" in this._currentEndpoint && this._currentEndpoint.start) {
            this._currentEndpoint.start();
          }
          this._currentEndpoint.addEventListener("message", receiveMessage, false);
          this._receiveMessage = receiveMessage;
          return;
        }
        this._originOnmessage = this._currentEndpoint.onmessage;
        this._currentEndpoint.onmessage = (event) => {
          if (this._originOnmessage) {
            this._originOnmessage(event);
          }
          receiveMessage(event);
        };
        this._receiveMessage = this._currentEndpoint.onmessage;
      }
      emit(event, ...args) {
        const data = {
          event,
          args
        };
        const result = this.sendAdapter ? this.sendAdapter(data, this._targetEndpoint) : { data };
        const sendData = result.data || data;
        const postMessageConfig = this.config ? typeof this.config === "function" ? this.config(sendData, this._targetEndpoint) || {} : this.config || {} : {};
        if (Array.isArray(result.transfer) && result.transfer.length) {
          postMessageConfig.transfer = result.transfer;
        }
        this._targetEndpoint.postMessage(sendData, postMessageConfig);
      }
      on(event, fn) {
        if (!this._events[event]) {
          this._events[event] = [];
        }
        this._events[event].push(fn);
      }
      off(event, fn) {
        if (!this._events[event])
          return;
        if (!fn) {
          this._events[event] = [];
          return;
        }
        const handlers = this._events[event] || [];
        this._events[event] = handlers.filter((handler) => handler !== fn);
      }
      destroy() {
        if (this._currentEndpoint.removeEventListener) {
          this._currentEndpoint.removeEventListener("message", this._receiveMessage, false);
          return;
        }
        try {
          this._currentEndpoint.onmessage = this._originOnmessage;
        } catch (error) {
          console.warn(error);
        }
      }
    };
    _RPC = class {
      constructor(options) {
        __publicField(this, "_event");
        __publicField(this, "_methods", {});
        __publicField(this, "_timeout", 0);
        __publicField(this, "_$connect", null);
        this._event = options.event;
        this._timeout = options.timeout || 0;
        if (options.methods) {
          Object.entries(options.methods).forEach(([method, handler]) => {
            this.registerMethod(method, handler);
          });
        }
        this._event.onerror = (error) => {
          const { code, message, data } = error;
          if (data.event && Array.isArray(data.args) && data.args.length) {
            const synEventData = data.args[0];
            const ackEventName = this._getAckEventName(synEventData.method);
            const ackEventData = {
              jsonrpc: "2.0",
              id: synEventData == null ? void 0 : synEventData.id,
              error: {
                code,
                message,
                data: synEventData
              }
            };
            this._event.emit(ackEventName, ackEventData);
          } else {
            console.error(error);
          }
        };
        this.connect();
      }
      static uuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c == "x" ? r : r & 3 | 8;
          return v.toString(16);
        });
      }
      _getSynEventName(method) {
        return `${_RPC.EVENT.SYN_SIGN}${method}`;
      }
      _getAckEventName(method) {
        return `${_RPC.EVENT.ACK_SIGN}${method}`;
      }
      connect(timeout) {
        if (this._$connect) {
          return this._$connect;
        }
        this._$connect = new Promise((resolve, reject) => {
          const connectTimeout = timeout || this._timeout;
          let connectTimer;
          if (connectTimeout) {
            connectTimer = setTimeout(() => {
              const error = __spreadProps(__spreadValues({}, RPCCodes.TIMEOUT), {
                data: { timeout: connectTimeout }
              });
              reject(error);
            }, connectTimeout);
          }
          const connectEventName = _RPC.EVENT.CONNECT;
          const connectAckEventName = this._getAckEventName(connectEventName);
          const connectSynEventName = this._getSynEventName(connectEventName);
          const resolveConnectEvent = () => {
            clearTimeout(connectTimer);
            resolve();
          };
          this._event.on(connectAckEventName, resolveConnectEvent);
          const connectSynEventHandler = () => {
            this._event.emit(connectAckEventName);
            resolveConnectEvent();
          };
          this._event.on(connectSynEventName, connectSynEventHandler);
          this._event.emit(connectSynEventName);
        });
        return this._$connect;
      }
      registerMethod(method, handler) {
        if (this._methods[method]) {
          throw new Error(`${method} already registered`);
        }
        this._methods[method] = handler;
        const synEventName = this._getSynEventName(method);
        const synEventHandler = (synEventData) => {
          const ackEventName = this._getAckEventName(method);
          if (!synEventData.id) {
            handler(...synEventData.params);
            return;
          }
          Promise.resolve(handler(...synEventData.params)).then((result) => {
            const ackEventData = {
              jsonrpc: "2.0",
              result,
              id: synEventData.id
            };
            this._event.emit(ackEventName, ackEventData);
          }).catch((error) => {
            const ackEventData = {
              jsonrpc: "2.0",
              id: synEventData.id,
              error: {
                code: (error == null ? void 0 : error.code) || RPCCodes.APPLICATION_ERROR.code,
                message: (error == null ? void 0 : error.message) || RPCCodes.APPLICATION_ERROR.message,
                data: null
              }
            };
            this._event.emit(ackEventName, ackEventData);
          });
        };
        this._event.on(synEventName, synEventHandler);
      }
      removeMethod(method) {
        if (!this._methods[method]) {
          delete this._methods[method];
        }
        const synEventName = this._getSynEventName(method);
        this._event.off(synEventName);
      }
      invoke(method, ...args) {
        return new Promise((resolve, reject) => {
          const lastArg = args[args.length - 1];
          const hasInvokeOptions = lastArg && typeof lastArg === "object" && (Reflect.has(lastArg, "isNotify") || Reflect.has(lastArg, "timeout"));
          const options = hasInvokeOptions ? lastArg : { isNotify: false, timeout: 0 };
          const params = hasInvokeOptions ? args.slice(0, -1) : args;
          const synEventName = this._getSynEventName(method);
          const synEventId = _RPC.uuid();
          const synEventData = {
            jsonrpc: "2.0",
            method,
            params,
            id: synEventId
          };
          this._event.emit(synEventName, synEventData);
          if (!options.isNotify) {
            const ackEventName = this._getAckEventName(method);
            const timeout = options.timeout || this._timeout;
            let timer;
            if (timeout) {
              timer = setTimeout(() => {
                const error = __spreadProps(__spreadValues({}, RPCCodes.CONNECT_TIMEOUT), {
                  data: { timeout }
                });
                reject(error);
              }, timeout);
            }
            const ackEventHandler = (ackEventData) => {
              if (ackEventData.id === synEventId) {
                clearTimeout(timer);
                this._event.off(ackEventName, ackEventHandler);
                if (!ackEventData.error) {
                  resolve(ackEventData.result);
                } else {
                  reject(ackEventData.error);
                }
              }
            };
            this._event.on(ackEventName, ackEventHandler);
          } else {
            resolve(void 0);
          }
        });
      }
      destroy() {
        Object.entries(this._methods).forEach(([method]) => {
          const synEventName = this._getSynEventName(method);
          this._event.off(synEventName);
        });
        const connectAckEventName = this._getAckEventName(_RPC.EVENT.CONNECT);
        const connectSynEventName = this._getSynEventName(_RPC.EVENT.CONNECT);
        this._event.off(connectSynEventName);
        this._event.off(connectAckEventName);
        if (this._event.destroy) {
          this._event.destroy();
        }
      }
    };
    RPC = _RPC;
    __publicField(RPC, "CODES", RPCCodes);
    __publicField(RPC, "EVENT", {
      SYN_SIGN: "syn:",
      ACK_SIGN: "ack:",
      CONNECT: "__rpc_connect_event",
      SYNC_METHODS: "__rpc_sync_methods_event"
    });
    DatabaseErrorCode = {
      InitializationFailed: 10001,
      RecordNotFound: 10002,
      OperationTimedOut: 10003,
      /** @deprecated Use `InitializationFailed` instead. */
      ErrorInit: 10001,
      /** @deprecated Use `RecordNotFound` instead. */
      ErrorNoRecord: 10002,
      /** @deprecated Use `OperationTimedOut` instead. */
      ErrorDBTimeout: 10003
    };
    (function(SdkEvent2) {
      SdkEvent2["Login"] = "Login";
      SdkEvent2["OnConnectFailed"] = "OnConnectFailed";
      SdkEvent2["OnConnectSuccess"] = "OnConnectSuccess";
      SdkEvent2["OnConnecting"] = "OnConnecting";
      SdkEvent2["OnKickedOffline"] = "OnKickedOffline";
      SdkEvent2["OnSelfInfoUpdated"] = "OnSelfInfoUpdated";
      SdkEvent2["OnUserTokenExpired"] = "OnUserTokenExpired";
      SdkEvent2["OnUserTokenInvalid"] = "OnUserTokenInvalid";
      SdkEvent2["OnProgress"] = "OnProgress";
      SdkEvent2["OnRecvNewMessage"] = "OnRecvNewMessage";
      SdkEvent2["OnRecvNewMessages"] = "OnRecvNewMessages";
      SdkEvent2["OnRecvOnlineOnlyMessage"] = "OnRecvOnlineOnlyMessage";
      SdkEvent2["OnRecvOfflineNewMessage"] = "OnRecvOfflineNewMessage";
      SdkEvent2["OnRecvOfflineNewMessages"] = "OnRecvOfflineNewMessages";
      SdkEvent2["OnRecvOnlineOnlyMessages"] = "OnRecvOnlineOnlyMessages";
      SdkEvent2["OnRecvMessageRevoked"] = "OnRecvMessageRevoked";
      SdkEvent2["OnNewRecvMessageRevoked"] = "OnNewRecvMessageRevoked";
      SdkEvent2["OnRecvMessageModified"] = "OnRecvMessageModified";
      SdkEvent2["OnRecvMessageExtensionsChanged"] = "OnRecvMessageExtensionsChanged";
      SdkEvent2["OnRecvMessageExtensionsDeleted"] = "OnRecvMessageExtensionsDeleted";
      SdkEvent2["OnRecvMessageExtensionsAdded"] = "OnRecvMessageExtensionsAdded";
      SdkEvent2["OnMsgDeleted"] = "OnMsgDeleted";
      SdkEvent2["OnRecvC2CReadReceipt"] = "OnRecvC2CReadReceipt";
      SdkEvent2["OnRecvGroupReadReceipt"] = "OnRecvGroupReadReceipt";
      SdkEvent2["OnConversationChanged"] = "OnConversationChanged";
      SdkEvent2["OnNewConversation"] = "OnNewConversation";
      SdkEvent2["OnConversationUserInputStatusChanged"] = "OnConversationUserInputStatusChanged";
      SdkEvent2["OnSyncServerFailed"] = "OnSyncServerFailed";
      SdkEvent2["OnSyncServerFinish"] = "OnSyncServerFinish";
      SdkEvent2["OnSyncServerProgress"] = "OnSyncServerProgress";
      SdkEvent2["OnSyncServerStart"] = "OnSyncServerStart";
      SdkEvent2["OnTotalUnreadMessageCountChanged"] = "OnTotalUnreadMessageCountChanged";
      SdkEvent2["OnBlackAdded"] = "OnBlackAdded";
      SdkEvent2["OnBlackDeleted"] = "OnBlackDeleted";
      SdkEvent2["OnFriendApplicationAccepted"] = "OnFriendApplicationAccepted";
      SdkEvent2["OnFriendApplicationAdded"] = "OnFriendApplicationAdded";
      SdkEvent2["OnFriendApplicationDeleted"] = "OnFriendApplicationDeleted";
      SdkEvent2["OnFriendApplicationRejected"] = "OnFriendApplicationRejected";
      SdkEvent2["OnFriendInfoChanged"] = "OnFriendInfoChanged";
      SdkEvent2["OnFriendAdded"] = "OnFriendAdded";
      SdkEvent2["OnFriendDeleted"] = "OnFriendDeleted";
      SdkEvent2["OnJoinedGroupAdded"] = "OnJoinedGroupAdded";
      SdkEvent2["OnJoinedGroupDeleted"] = "OnJoinedGroupDeleted";
      SdkEvent2["OnGroupDismissed"] = "OnGroupDismissed";
      SdkEvent2["OnGroupMemberAdded"] = "OnGroupMemberAdded";
      SdkEvent2["OnGroupMemberDeleted"] = "OnGroupMemberDeleted";
      SdkEvent2["OnGroupApplicationAdded"] = "OnGroupApplicationAdded";
      SdkEvent2["OnGroupApplicationDeleted"] = "OnGroupApplicationDeleted";
      SdkEvent2["OnGroupInfoChanged"] = "OnGroupInfoChanged";
      SdkEvent2["OnGroupMemberInfoChanged"] = "OnGroupMemberInfoChanged";
      SdkEvent2["OnGroupApplicationAccepted"] = "OnGroupApplicationAccepted";
      SdkEvent2["OnGroupApplicationRejected"] = "OnGroupApplicationRejected";
      SdkEvent2["UploadComplete"] = "UploadComplete";
      SdkEvent2["OnRecvCustomBusinessMessage"] = "OnRecvCustomBusinessMessage";
      SdkEvent2["OnUserStatusChanged"] = "OnUserStatusChanged";
      SdkEvent2["OnUserInputStatusChanged"] = "OnUserInputStatusChanged";
      SdkEvent2["OnUserCommandAdd"] = "OnUserCommandAdd";
      SdkEvent2["OnUserCommandDelete"] = "OnUserCommandDelete";
      SdkEvent2["OnUserCommandUpdate"] = "OnUserCommandUpdate";
      SdkEvent2["OnUploadLogsProgress"] = "OnUploadLogsProgress";
      SdkEvent2["OnReceiveNewInvitation"] = "OnReceiveNewInvitation";
      SdkEvent2["OnInviteeAccepted"] = "OnInviteeAccepted";
      SdkEvent2["OnInviteeRejected"] = "OnInviteeRejected";
      SdkEvent2["OnInvitationCancelled"] = "OnInvitationCancelled";
      SdkEvent2["OnHangUp"] = "OnHangUp";
      SdkEvent2["OnInvitationTimeout"] = "OnInvitationTimeout";
      SdkEvent2["OnInviteeAcceptedByOtherDevice"] = "OnInviteeAcceptedByOtherDevice";
      SdkEvent2["OnInviteeRejectedByOtherDevice"] = "OnInviteeRejectedByOtherDevice";
      SdkEvent2["OnStreamChange"] = "OnStreamChange";
      SdkEvent2["OnRoomParticipantConnected"] = "OnRoomParticipantConnected";
      SdkEvent2["OnRoomParticipantDisconnected"] = "OnRoomParticipantDisconnected";
      SdkEvent2["OnReceiveCustomSignal"] = "OnReceiveCustomSignal";
      SdkEvent2["Open"] = "Open";
      SdkEvent2["PartSize"] = "PartSize";
      SdkEvent2["HashPartProgress"] = "HashPartProgress";
      SdkEvent2["HashPartComplete"] = "HashPartComplete";
      SdkEvent2["UploadID"] = "UploadID";
      SdkEvent2["UploadPartComplete"] = "UploadPartComplete";
      SdkEvent2["Complete"] = "Complete";
      SdkEvent2["UnUsedEvent"] = "UnUsedEvent";
    })(SdkEvent || (SdkEvent = {}));
    CbEvents = SdkEvent;
    debug = false;
    DATABASE_RPC_TIMEOUT_MS = 4500;
    initWorker();
    workerPromise = rpc === null || rpc === void 0 ? void 0 : rpc.connect(5e3);
    Emitter = class {
      constructor() {
        this.events = {};
      }
      emit(event, data) {
        if (this.events[event]) {
          this.events[event].forEach((fn) => {
            return fn(data);
          });
        }
        return this;
      }
      on(event, fn) {
        if (this.events[event]) {
          this.events[event].push(fn);
        } else {
          this.events[event] = [fn];
        }
        return this;
      }
      off(event, fn) {
        if (event && typeof fn === "function" && this.events[event]) {
          const listeners = this.events[event];
          if (!listeners || listeners.length === 0) {
            return;
          }
          const index = listeners.findIndex((_fn) => {
            return _fn === fn;
          });
          if (index !== -1) {
            listeners.splice(index, 1);
          }
        }
        return this;
      }
    };
    rnds8 = new Uint8Array(16);
    byteToHex = [];
    for (let i = 0; i < 256; ++i) {
      byteToHex.push((i + 256).toString(16).slice(1));
    }
    randomUUID = typeof crypto !== "undefined" && crypto.randomUUID && crypto.randomUUID.bind(crypto);
    native = {
      randomUUID
    };
    initialized = false;
    CACHE_KEY = "openim-wasm-cache";
    UNEXPOSED_WASM_EXPORTS = ["markMessagesAsReadByMsgID"];
    WasmSdk = class extends Emitter {
      constructor(url = "/openIM.wasm", debug2 = true) {
        super();
        this.goExited = false;
        this.parseResponses = true;
        this.logToConsole = true;
        this.login = async (params, operationID = v4()) => {
          var _a, _b;
          this.logSdk(`SDK => (invoked by js) run login with args ${JSON.stringify({
            params,
            operationID
          })}`);
          await workerPromise;
          await this.wasmInitializationPromise;
          window.commonEventFunc((event) => {
            try {
              this.logSdk(`%cSDK =>%c received event %c${event}%c `, logBoxStyleValue("#282828", "#ffffff"), "", "color: #4f2398;", "");
              const parsed = JSON.parse(event);
              if (this.parseResponses) {
                try {
                  parsed.data = JSON.parse(parsed.data);
                } catch (error) {
                }
              }
              this.emit(parsed.event, parsed);
            } catch (error) {
              console.error(error);
            }
          });
          const config = {
            platformID: params.platformID,
            apiAddr: params.apiAddr,
            wsAddr: params.wsAddr,
            dataDir: "./",
            systemType: "web",
            logLevel: params.logLevel || 5,
            isLogStandardOutput: (_a = params.isLogStandardOutput) !== null && _a !== void 0 ? _a : this.logToConsole,
            logFilePath: "./",
            isExternalExtensions: params.isExternalExtensions || false
          };
          this.parseResponses = (_b = params.tryParse) !== null && _b !== void 0 ? _b : true;
          window.initSDK(operationID, JSON.stringify(config));
          return await window.login(operationID, params.userID, params.token);
        };
        this.logout = (operationID = v4()) => {
          window.fileMapClear();
          return this.invokeCore("logout", window.logout, [operationID]);
        };
        this.getAllConversationList = (operationID = v4()) => {
          return this.invokeCore("getAllConversationList", window.getAllConversationList, [operationID]);
        };
        this.getOneConversation = (params, operationID = v4()) => {
          return this.invokeCore("getOneConversation", window.getOneConversation, [operationID, params.sessionType, params.sourceID]);
        };
        this.getAdvancedHistoryMessageList = (params, operationID = v4()) => {
          return this.invokeCore("getAdvancedHistoryMessageList", window.getAdvancedHistoryMessageList, [operationID, JSON.stringify(params)]);
        };
        this.getAdvancedHistoryMessageListReverse = (params, operationID = v4()) => {
          return this.invokeCore("getAdvancedHistoryMessageListReverse", window.getAdvancedHistoryMessageListReverse, [operationID, JSON.stringify(params)]);
        };
        this.getSpecifiedGroupsInfo = (params, operationID = v4()) => {
          return this.invokeCore("getSpecifiedGroupsInfo", window.getSpecifiedGroupsInfo, [operationID, JSON.stringify(params)]);
        };
        this.deleteConversationAndDeleteAllMsg = (conversationID, operationID = v4()) => {
          return this.invokeCore("deleteConversationAndDeleteAllMsg", window.deleteConversationAndDeleteAllMsg, [operationID, conversationID]);
        };
        this.markConversationMessageAsRead = (data, operationID = v4()) => {
          return this.invokeCore("markConversationMessageAsRead", window.markConversationMessageAsRead, [operationID, data]);
        };
        this.markAllConversationMessageAsRead = (operationID = v4()) => {
          return this.invokeCore("markAllConversationMessageAsRead", window.markAllConversationMessageAsRead, [operationID]);
        };
        this.getGroupMemberList = (params, operationID = v4()) => {
          return this.invokeCore("getGroupMemberList", window.getGroupMemberList, [operationID, params.groupID, params.filter, params.offset, params.count]);
        };
        this.createTextMessage = (text, operationID = v4()) => {
          return this.invokeCore("createTextMessage", window.createTextMessage, [operationID, text], (data) => {
            return data[0];
          });
        };
        this.createImageMessage = (imagePath, operationID = v4()) => {
          return this.invokeCore("createImageMessage", window.createImageMessage, [operationID, imagePath], (data) => data[0]);
        };
        this.createImageMessageFromFullPath = (imageFullPath, operationID = v4()) => {
          return this.invokeCore("createImageMessageFromFullPath", window.createImageMessageFromFullPath, [operationID, imageFullPath], (data) => data[0]);
        };
        this.createImageMessageByURL = (params, operationID = v4()) => {
          return this.invokeCore("createImageMessageByURL", window.createImageMessageByURL, [
            operationID,
            params.sourcePath,
            JSON.stringify(params.sourcePicture),
            JSON.stringify(params.bigPicture),
            JSON.stringify(params.snapshotPicture)
          ], (data) => {
            return data[0];
          });
        };
        this.createImageMessageByFile = (params, operationID = v4()) => {
          params.sourcePicture.uuid = `${params.sourcePicture.uuid}/${params.file.name}`;
          window.fileMapSet(params.sourcePicture.uuid, params.file);
          return this.invokeCore("createImageMessageByFile", window.createImageMessageByURL, [
            operationID,
            params.sourcePath,
            JSON.stringify(params.sourcePicture),
            JSON.stringify(params.bigPicture),
            JSON.stringify(params.snapshotPicture)
          ], (data) => {
            return data[0];
          });
        };
        this.createCustomMessage = (params, operationID = v4()) => {
          return this.invokeCore("createCustomMessage", window.createCustomMessage, [operationID, params.data, params.extension, params.description], (data) => {
            return data[0];
          });
        };
        this.createQuoteMessage = (params, operationID = v4()) => {
          return this.invokeCore("createQuoteMessage", window.createQuoteMessage, [operationID, params.text, params.message], (data) => {
            return data[0];
          });
        };
        this.createAdvancedQuoteMessage = (params, operationID = v4()) => {
          return this.invokeCore("createAdvancedQuoteMessage", window.createAdvancedQuoteMessage, [
            operationID,
            params.text,
            JSON.stringify(params.message),
            JSON.stringify(params.messageEntityList)
          ], (data) => {
            return data[0];
          });
        };
        this.createAdvancedTextMessage = (params, operationID = v4()) => {
          return this.invokeCore("createAdvancedTextMessage", window.createAdvancedTextMessage, [operationID, params.text, JSON.stringify(params.messageEntityList)], (data) => {
            return data[0];
          });
        };
        this.sendMessage = (params, operationID = v4()) => {
          var _a, _b;
          const offlinePushInfo = (_a = params.offlinePushInfo) !== null && _a !== void 0 ? _a : {
            title: "You have a new message.",
            desc: "",
            ex: "",
            iOSPushSound: "+1",
            iOSBadgeCount: true
          };
          return this.invokeCore("sendMessage", window.sendMessage, [
            operationID,
            JSON.stringify(params.message),
            params.recvID,
            params.groupID,
            JSON.stringify(offlinePushInfo),
            (_b = params.isOnlineOnly) !== null && _b !== void 0 ? _b : false
          ]);
        };
        this.sendMessageNotOss = (params, operationID = v4()) => {
          var _a, _b;
          const offlinePushInfo = (_a = params.offlinePushInfo) !== null && _a !== void 0 ? _a : {
            title: "You have a new message.",
            desc: "",
            ex: "",
            iOSPushSound: "+1",
            iOSBadgeCount: true
          };
          return this.invokeCore("sendMessageNotOss", window.sendMessageNotOss, [
            operationID,
            JSON.stringify(params.message),
            params.recvID,
            params.groupID,
            JSON.stringify(offlinePushInfo),
            (_b = params.isOnlineOnly) !== null && _b !== void 0 ? _b : false
          ]);
        };
        this.setMessageLocalEx = (params, operationID = v4()) => {
          return this.invokeCore("setMessageLocalEx", window.setMessageLocalEx, [operationID, params.conversationID, params.clientMsgID, params.localEx]);
        };
        this.revokeMessage = (data, operationID = v4()) => {
          return this.invokeCore("revokeMessage", window.revokeMessage, [
            operationID,
            data.conversationID,
            data.clientMsgID
          ]);
        };
        this.setConversation = (params, operationID = v4()) => {
          return this.invokeCore("setConversation", window.setConversation, [
            operationID,
            params.conversationID,
            JSON.stringify(params)
          ]);
        };
        this.getLoginStatus = (operationID = v4()) => {
          return this.invokeCore("getLoginStatus", window.getLoginStatus, [operationID], (data) => {
            return data[0];
          });
        };
        this.setAppBackgroundStatus = (data, operationID = v4()) => {
          return this.invokeCore("setAppBackgroundStatus", window.setAppBackgroundStatus, [operationID, data]);
        };
        this.networkStatusChanged = (operationID = v4()) => {
          return this.invokeCore("networkStatusChanged ", window.networkStatusChanged, [operationID]);
        };
        this.getSelfUserInfo = (operationID = v4()) => {
          return this.invokeCore("getSelfUserInfo", window.getSelfUserInfo, [operationID]);
        };
        this.getUsersInfo = (data, operationID = v4()) => {
          return this.invokeCore("getUsersInfo", window.getUsersInfo, [operationID, JSON.stringify(data)]);
        };
        this.setSelfInfo = (data, operationID = v4()) => {
          return this.invokeCore("setSelfInfo", window.setSelfInfo, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.createTextAtMessage = (data, operationID = v4()) => {
          var _a;
          return this.invokeCore("createTextAtMessage", window.createTextAtMessage, [
            operationID,
            data.text,
            JSON.stringify(data.atUserIDList),
            JSON.stringify(data.atUsersInfo),
            (_a = JSON.stringify(data.message)) !== null && _a !== void 0 ? _a : ""
          ], (data2) => {
            return data2[0];
          });
        };
        this.createSoundMessageByURL = (data, operationID = v4()) => {
          return this.invokeCore("createSoundMessageByURL", window.createSoundMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createSoundMessage = (soundPath, duration, operationID = v4()) => {
          return this.invokeCore("createSoundMessage", window.createSoundMessage, [operationID, soundPath, duration], (data) => data[0]);
        };
        this.createSoundMessageFromFullPath = (soundPath, duration, operationID = v4()) => {
          return this.invokeCore("createSoundMessageFromFullPath", window.createSoundMessageFromFullPath, [operationID, soundPath, duration], (data) => data[0]);
        };
        this.createSoundMessageByFile = (data, operationID = v4()) => {
          data.uuid = `${data.uuid}/${data.file.name}`;
          window.fileMapSet(data.uuid, data.file);
          return this.invokeCore("createSoundMessageByFile", window.createSoundMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createVideoMessageByURL = (data, operationID = v4()) => {
          return this.invokeCore("createVideoMessageByURL", window.createVideoMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createVideoMessage = (videoPath, videoType, duration, snapshotPath, operationID = v4()) => {
          return this.invokeCore("createVideoMessage", window.createVideoMessage, [operationID, videoPath, videoType, duration, snapshotPath], (data) => data[0]);
        };
        this.createVideoMessageFromFullPath = (videoFullPath, videoType, duration, snapshotFullPath, operationID = v4()) => {
          return this.invokeCore("createVideoMessageFromFullPath", window.createVideoMessageFromFullPath, [operationID, videoFullPath, videoType, duration, snapshotFullPath], (data) => data[0]);
        };
        this.createVideoMessageByFile = (data, operationID = v4()) => {
          data.videoUUID = `${data.videoUUID}/${data.videoFile.name}`;
          data.snapshotUUID = `${data.snapshotUUID}/${data.snapshotFile.name}`;
          window.fileMapSet(data.videoUUID, data.videoFile);
          window.fileMapSet(data.snapshotUUID, data.snapshotFile);
          return this.invokeCore("createVideoMessageByFile", window.createVideoMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createFileMessageByURL = (data, operationID = v4()) => {
          return this.invokeCore("createFileMessageByURL", window.createFileMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createFileMessage = (filePath, fileName, operationID = v4()) => {
          return this.invokeCore("createFileMessage", window.createFileMessage, [operationID, filePath, fileName], (data) => data[0]);
        };
        this.createFileMessageFromFullPath = (fileFullPath, fileName, operationID = v4()) => {
          return this.invokeCore("createFileMessageFromFullPath", window.createFileMessageFromFullPath, [operationID, fileFullPath, fileName], (data) => data[0]);
        };
        this.createFileMessageByFile = (data, operationID = v4()) => {
          data.uuid = `${data.uuid}/${data.file.name}`;
          window.fileMapSet(data.uuid, data.file);
          return this.invokeCore("createFileMessageByFile", window.createFileMessageByURL, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createMergerMessage = (data, operationID = v4()) => {
          return this.invokeCore("createMergerMessage ", window.createMergerMessage, [
            operationID,
            JSON.stringify(data.messageList),
            data.title,
            JSON.stringify(data.summaryList)
          ], (data2) => {
            return data2[0];
          });
        };
        this.createForwardMessage = (data, operationID = v4()) => {
          return this.invokeCore("createForwardMessage ", window.createForwardMessage, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.createFaceMessage = (data, operationID = v4()) => {
          return this.invokeCore("createFaceMessage ", window.createFaceMessage, [operationID, data.index, data.data], (data2) => {
            return data2[0];
          });
        };
        this.createLocationMessage = (data, operationID = v4()) => {
          return this.invokeCore("createLocationMessage ", window.createLocationMessage, [operationID, data.description, data.longitude, data.latitude], (data2) => {
            return data2[0];
          });
        };
        this.createCardMessage = (data, operationID = v4()) => {
          return this.invokeCore("createCardMessage ", window.createCardMessage, [operationID, JSON.stringify(data)], (data2) => {
            return data2[0];
          });
        };
        this.deleteMessageFromLocalStorage = (data, operationID = v4()) => {
          return this.invokeCore("deleteMessageFromLocalStorage ", window.deleteMessageFromLocalStorage, [operationID, data.conversationID, data.clientMsgID]);
        };
        this.deleteMessage = (data, operationID = v4()) => {
          return this.invokeCore("deleteMessage ", window.deleteMessage, [
            operationID,
            data.conversationID,
            data.clientMsgID
          ]);
        };
        this.hideAllConversations = (operationID = v4()) => {
          return this.invokeCore("hideAllConversations", window.hideAllConversations, [operationID]);
        };
        this.deleteAllMsgFromLocal = (operationID = v4()) => {
          return this.invokeCore("deleteAllMsgFromLocal ", window.deleteAllMsgFromLocal, [operationID]);
        };
        this.deleteAllMsgFromLocalAndSvr = (operationID = v4()) => {
          return this.invokeCore("deleteAllMsgFromLocalAndSvr ", window.deleteAllMsgFromLocalAndSvr, [operationID]);
        };
        this.insertSingleMessageToLocalStorage = (data, operationID = v4()) => {
          return this.invokeCore("insertSingleMessageToLocalStorage ", window.insertSingleMessageToLocalStorage, [operationID, JSON.stringify(data.message), data.recvID, data.sendID]);
        };
        this.insertGroupMessageToLocalStorage = (data, operationID = v4()) => {
          return this.invokeCore("insertGroupMessageToLocalStorage ", window.insertGroupMessageToLocalStorage, [operationID, JSON.stringify(data.message), data.groupID, data.sendID]);
        };
        this.changeInputStates = (data, operationID = v4()) => {
          return this.invokeCore("changeInputStates ", window.changeInputStates, [operationID, data.conversationID, data.focus]);
        };
        this.getInputStates = (data, operationID = v4()) => {
          return this.invokeCore("getInputStates", window.getInputStates, [operationID, data.conversationID, data.userID]);
        };
        this.clearConversationAndDeleteAllMsg = (data, operationID = v4()) => {
          return this.invokeCore("clearConversationAndDeleteAllMsg ", window.clearConversationAndDeleteAllMsg, [operationID, data]);
        };
        this.hideConversation = (data, operationID = v4()) => {
          return this.invokeCore("hideConversation ", window.hideConversation, [
            operationID,
            data
          ]);
        };
        this.getConversationListSplit = (data, operationID = v4()) => {
          return this.invokeCore("getConversationListSplit ", window.getConversationListSplit, [operationID, data.offset, data.count]);
        };
        this.searchConversation = (searchParam, operationID = v4()) => {
          return this.invokeCore("searchConversation", window.searchConversation, [operationID, searchParam]);
        };
        this.getMultipleConversation = (data, operationID = v4()) => {
          return this.invokeCore("getMultipleConversation ", window.getMultipleConversation, [operationID, JSON.stringify(data)]);
        };
        this.setConversationDraft = (data, operationID = v4()) => {
          return this.invokeCore("setConversationDraft ", window.setConversationDraft, [operationID, data.conversationID, data.draftText]);
        };
        this.getTotalUnreadMsgCount = (operationID = v4()) => {
          return this.invokeCore("getTotalUnreadMsgCount ", window.getTotalUnreadMsgCount, [operationID]);
        };
        this.searchLocalMessages = (data, operationID = v4()) => {
          return this.invokeCore("searchLocalMessages ", window.searchLocalMessages, [operationID, JSON.stringify(data)]);
        };
        this.addFriend = (data, operationID = v4()) => {
          return this.invokeCore("addFriend ", window.addFriend, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.searchFriends = (data, operationID = v4()) => {
          return this.invokeCore("searchFriends ", window.searchFriends, [operationID, JSON.stringify(data)]);
        };
        this.getSpecifiedFriendsInfo = (data, operationID = v4()) => {
          return this.invokeCore("getSpecifiedFriendsInfo", window.getSpecifiedFriendsInfo, [operationID, JSON.stringify(data.friendUserIDList), data.filterBlack]);
        };
        this.getFriendApplicationListAsRecipient = (data = {
          handleResults: [],
          offset: 0,
          count: 0
        }, operationID = v4()) => {
          return this.invokeCore("getFriendApplicationListAsRecipient ", window.getFriendApplicationListAsRecipient, [operationID, JSON.stringify(data)]);
        };
        this.getFriendApplicationListAsApplicant = (data = {
          offset: 0,
          count: 0
        }, operationID = v4()) => {
          return this.invokeCore("getFriendApplicationListAsApplicant ", window.getFriendApplicationListAsApplicant, [operationID, JSON.stringify(data)]);
        };
        this.getFriendApplicationUnhandledCount = (data, operationID = v4()) => {
          return this.invokeCore("getFriendApplicationUnhandledCount ", window.getFriendApplicationUnhandledCount, [operationID, JSON.stringify(data)]);
        };
        this.getFriendList = (filterBlack = false, operationID = v4()) => {
          return this.invokeCore("getFriendList ", window.getFriendList, [operationID, filterBlack]);
        };
        this.getFriendListPage = (data, operationID = v4()) => {
          var _a;
          return this.invokeCore("getFriendListPage ", window.getFriendListPage, [operationID, data.offset, data.count, (_a = data.filterBlack) !== null && _a !== void 0 ? _a : false]);
        };
        this.updateFriends = (data, operationID = v4()) => {
          return this.invokeCore("updateFriends ", window.updateFriends, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.checkFriend = (data, operationID = v4()) => {
          return this.invokeCore("checkFriend", window.checkFriend, [operationID, JSON.stringify(data)]);
        };
        this.acceptFriendApplication = (data, operationID = v4()) => {
          return this.invokeCore("acceptFriendApplication", window.acceptFriendApplication, [operationID, JSON.stringify(data)]);
        };
        this.refuseFriendApplication = (data, operationID = v4()) => {
          return this.invokeCore("refuseFriendApplication ", window.refuseFriendApplication, [operationID, JSON.stringify(data)]);
        };
        this.deleteFriend = (data, operationID = v4()) => {
          return this.invokeCore("deleteFriend ", window.deleteFriend, [
            operationID,
            data
          ]);
        };
        this.addBlack = (data, operationID = v4()) => {
          var _a;
          return this.invokeCore("addBlack ", window.addBlack, [
            operationID,
            data.toUserID,
            (_a = data.ex) !== null && _a !== void 0 ? _a : ""
          ]);
        };
        this.removeBlack = (data, operationID = v4()) => {
          return this.invokeCore("removeBlack ", window.removeBlack, [
            operationID,
            data
          ]);
        };
        this.getBlackList = (operationID = v4()) => {
          return this.invokeCore("getBlackList ", window.getBlackList, [operationID]);
        };
        this.inviteUserToGroup = (data, operationID = v4()) => {
          return this.invokeCore("inviteUserToGroup ", window.inviteUserToGroup, [operationID, data.groupID, data.reason, JSON.stringify(data.userIDList)]);
        };
        this.kickGroupMember = (data, operationID = v4()) => {
          return this.invokeCore("kickGroupMember ", window.kickGroupMember, [
            operationID,
            data.groupID,
            data.reason,
            JSON.stringify(data.userIDList)
          ]);
        };
        this.isJoinGroup = (data, operationID = v4()) => {
          return this.invokeCore("isJoinGroup ", window.isJoinGroup, [
            operationID,
            data
          ]);
        };
        this.getSpecifiedGroupMembersInfo = (data, operationID = v4()) => {
          return this.invokeCore("getSpecifiedGroupMembersInfo ", window.getSpecifiedGroupMembersInfo, [operationID, data.groupID, JSON.stringify(data.userIDList)]);
        };
        this.getUsersInGroup = (data, operationID = v4()) => {
          return this.invokeCore("getUsersInGroup ", window.getUsersInGroup, [operationID, data.groupID, JSON.stringify(data.userIDList)]);
        };
        this.getGroupMemberListByJoinTimeFilter = (data, operationID = v4()) => {
          return this.invokeCore("getGroupMemberListByJoinTimeFilter ", window.getGroupMemberListByJoinTimeFilter, [
            operationID,
            data.groupID,
            data.offset,
            data.count,
            data.joinTimeBegin,
            data.joinTimeEnd,
            JSON.stringify(data.filterUserIDList)
          ]);
        };
        this.searchGroupMembers = (data, operationID = v4()) => {
          return this.invokeCore("searchGroupMembers ", window.searchGroupMembers, [operationID, JSON.stringify(data)]);
        };
        this.getJoinedGroupList = (operationID = v4()) => {
          return this.invokeCore("getJoinedGroupList ", window.getJoinedGroupList, [operationID]);
        };
        this.getJoinedGroupListPage = (data, operationID = v4()) => {
          return this.invokeCore("getJoinedGroupListPage ", window.getJoinedGroupListPage, [operationID, data.offset, data.count]);
        };
        this.createGroup = (data, operationID = v4()) => {
          return this.invokeCore("createGroup ", window.createGroup, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.setGroupInfo = (data, operationID = v4()) => {
          return this.invokeCore("setGroupInfo ", window.setGroupInfo, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.setGroupMemberInfo = (data, operationID = v4()) => {
          return this.invokeCore("setGroupMemberInfo ", window.setGroupMemberInfo, [operationID, JSON.stringify(data)]);
        };
        this.joinGroup = (data, operationID = v4()) => {
          var _a;
          return this.invokeCore("joinGroup ", window.joinGroup, [
            operationID,
            data.groupID,
            data.reqMsg,
            data.joinSource,
            (_a = data.ex) !== null && _a !== void 0 ? _a : ""
          ]);
        };
        this.searchGroups = (data, operationID = v4()) => {
          return this.invokeCore("searchGroups ", window.searchGroups, [
            operationID,
            JSON.stringify(data)
          ]);
        };
        this.quitGroup = (data, operationID = v4()) => {
          return this.invokeCore("quitGroup ", window.quitGroup, [
            operationID,
            data
          ]);
        };
        this.dismissGroup = (data, operationID = v4()) => {
          return this.invokeCore("dismissGroup ", window.dismissGroup, [
            operationID,
            data
          ]);
        };
        this.changeGroupMute = (data, operationID = v4()) => {
          return this.invokeCore("changeGroupMute ", window.changeGroupMute, [
            operationID,
            data.groupID,
            data.isMute
          ]);
        };
        this.changeGroupMemberMute = (data, operationID = v4()) => {
          return this.invokeCore("changeGroupMemberMute ", window.changeGroupMemberMute, [operationID, data.groupID, data.userID, data.mutedSeconds]);
        };
        this.transferGroupOwner = (data, operationID = v4()) => {
          return this.invokeCore("transferGroupOwner ", window.transferGroupOwner, [operationID, data.groupID, data.newOwnerUserID]);
        };
        this.getGroupApplicationListAsApplicant = (data = {
          groupIDs: [],
          handleResults: [],
          offset: 0,
          count: 0
        }, operationID = v4()) => {
          return this.invokeCore("getGroupApplicationListAsApplicant ", window.getGroupApplicationListAsApplicant, [operationID, JSON.stringify(data)]);
        };
        this.getGroupApplicationListAsRecipient = (data = {
          groupIDs: [],
          handleResults: [],
          offset: 0,
          count: 0
        }, operationID = v4()) => {
          return this.invokeCore("getGroupApplicationListAsRecipient ", window.getGroupApplicationListAsRecipient, [operationID, JSON.stringify(data)]);
        };
        this.getGroupApplicationUnhandledCount = (data, operationID = v4()) => {
          return this.invokeCore("getGroupApplicationUnhandledCount ", window.getGroupApplicationUnhandledCount, [operationID, JSON.stringify(data)]);
        };
        this.acceptGroupApplication = (data, operationID = v4()) => {
          return this.invokeCore("acceptGroupApplication ", window.acceptGroupApplication, [operationID, data.groupID, data.fromUserID, data.handleMsg]);
        };
        this.refuseGroupApplication = (data, operationID = v4()) => {
          return this.invokeCore("refuseGroupApplication ", window.refuseGroupApplication, [operationID, data.groupID, data.fromUserID, data.handleMsg]);
        };
        this.getGroupMemberOwnerAndAdmin = (data, operationID = v4()) => {
          return this.invokeCore("getGroupMemberOwnerAndAdmin ", window.getGroupMemberOwnerAndAdmin, [operationID, data]);
        };
        this.getAtAllTag = (operationID = v4()) => {
          return this.invokeCore("getAtAllTag", window.getAtAllTag, [
            operationID
          ]);
        };
        this.findMessageList = (data, operationID = v4()) => {
          return this.invokeCore("findMessageList ", window.findMessageList, [operationID, JSON.stringify(data)]);
        };
        this.uploadFile = (data, operationID = v4()) => {
          var _a;
          data.uuid = `${data.uuid}/${(_a = data.file) === null || _a === void 0 ? void 0 : _a.name}`;
          window.fileMapSet(data.uuid, data.file);
          return this.invokeCore("uploadFile ", window.uploadFile, [
            operationID,
            JSON.stringify({
              ...data,
              filepath: "",
              cause: ""
            })
          ]);
        };
        this.updateFcmToken = (fcmToken, expireTime, operationID = v4()) => {
          return this.invokeCore("updateFcmToken", window.updateFcmToken, [
            operationID,
            fcmToken,
            expireTime
          ]);
        };
        this.subscribeUsersStatus = (data, operationID = v4()) => {
          return this.invokeCore("subscribeUsersStatus ", window.subscribeUsersStatus, [operationID, JSON.stringify(data)]);
        };
        this.unsubscribeUsersStatus = (data, operationID = v4()) => {
          return this.invokeCore("unsubscribeUsersStatus ", window.unsubscribeUsersStatus, [operationID, JSON.stringify(data)]);
        };
        this.getUserStatus = (data, operationID = v4()) => {
          return this.invokeCore("getUserStatus ", window.getUserStatus, [operationID, JSON.stringify(data)]);
        };
        this.getSubscribeUsersStatus = (operationID = v4()) => {
          return this.invokeCore("getSubscribeUsersStatus ", window.getSubscribeUsersStatus, [operationID]);
        };
        this.fileMapSet = (uuid, file) => window.fileMapSet(uuid, file);
        initDatabaseAPI(debug2);
        this.logToConsole = debug2;
        this.wasmInitializationPromise = initializeWasm(url);
        this.goRuntimeExitPromise = getGoExitPromise();
        if (this.goRuntimeExitPromise) {
          this.goRuntimeExitPromise.then(() => {
            this.logSdk("SDK => wasm exist");
          }).catch((err) => {
            this.logSdk("SDK => wasm with error ", err);
          }).finally(() => {
            this.goExited = true;
          });
        }
      }
      logSdk(...args) {
        if (this.logToConsole) {
          console.info(...args);
        }
      }
      invokeCore(functionName, func, args, processor) {
        return new Promise(async (resolve, reject) => {
          this.logSdk(`%cSDK =>%c [OperationID:${args[0]}] (invoked by js) run ${functionName} with args ${JSON.stringify(args)}`, "font-size:14px; background:#7CAEFF; border-radius:4px; padding-inline:4px;", "");
          let response = {
            operationID: args[0],
            event: functionName.slice(0, 1).toUpperCase() + functionName.slice(1).toLowerCase(),
            errCode: 0,
            errMsg: ""
          };
          try {
            if (!getGO() || getGO().exited || this.goExited) {
              throw "wasm exist already, fail to run";
            }
            let data = await func(...args);
            if (processor) {
              this.logSdk(`%cSDK =>%c [OperationID:${args[0]}] (invoked by js) run ${functionName} with response before processor ${JSON.stringify(data)}`, logBoxStyleValue("#FFDC19"), "");
              data = processor(data);
            }
            if (this.parseResponses) {
              try {
                data = JSON.parse(data);
              } catch (error) {
              }
            }
            response.data = data;
            resolve(response);
          } catch (error) {
            this.logSdk(`%cSDK =>%c [OperationID:${args[0]}] (invoked by js) run ${functionName} with error ${JSON.stringify(error)}`, logBoxStyleValue("#EE4245"), "");
            response = {
              ...response,
              ...error
            };
            reject(response);
          }
        });
      }
      exportDB(operationID = v4()) {
        return this.invokeCore("exportDB", window.exportDB, [operationID]);
      }
    };
    (function(MessageReceiveOption2) {
      MessageReceiveOption2[MessageReceiveOption2["Normal"] = 0] = "Normal";
      MessageReceiveOption2[MessageReceiveOption2["Receive"] = 0] = "Receive";
      MessageReceiveOption2[MessageReceiveOption2["NotReceive"] = 1] = "NotReceive";
      MessageReceiveOption2[MessageReceiveOption2["DoNotReceive"] = 1] = "DoNotReceive";
      MessageReceiveOption2[MessageReceiveOption2["NotNotify"] = 2] = "NotNotify";
      MessageReceiveOption2[MessageReceiveOption2["ReceiveWithoutNotification"] = 2] = "ReceiveWithoutNotification";
    })(MessageReceiveOption || (MessageReceiveOption = {}));
    (function(AddFriendPermission2) {
      AddFriendPermission2[AddFriendPermission2["AddFriendAllowed"] = 0] = "AddFriendAllowed";
      AddFriendPermission2[AddFriendPermission2["AddFriendAllowedNoReview"] = 1] = "AddFriendAllowedNoReview";
      AddFriendPermission2[AddFriendPermission2["AddFriendDenied"] = 2] = "AddFriendDenied";
    })(AddFriendPermission || (AddFriendPermission = {}));
    (function(AllowType2) {
      AllowType2[AllowType2["Allowed"] = 0] = "Allowed";
      AllowType2[AllowType2["NotAllowed"] = 1] = "NotAllowed";
    })(AllowType || (AllowType = {}));
    (function(GroupType2) {
      GroupType2[GroupType2["Group"] = 2] = "Group";
      GroupType2[GroupType2["WorkingGroup"] = 2] = "WorkingGroup";
    })(GroupType || (GroupType = {}));
    (function(GroupJoinSource2) {
      GroupJoinSource2[GroupJoinSource2["Invitation"] = 2] = "Invitation";
      GroupJoinSource2[GroupJoinSource2["Search"] = 3] = "Search";
      GroupJoinSource2[GroupJoinSource2["QrCode"] = 4] = "QrCode";
    })(GroupJoinSource || (GroupJoinSource = {}));
    (function(GroupMemberRole2) {
      GroupMemberRole2[GroupMemberRole2["Normal"] = 20] = "Normal";
      GroupMemberRole2[GroupMemberRole2["Admin"] = 60] = "Admin";
      GroupMemberRole2[GroupMemberRole2["Owner"] = 100] = "Owner";
    })(GroupMemberRole || (GroupMemberRole = {}));
    (function(GroupVerificationType2) {
      GroupVerificationType2[GroupVerificationType2["ApplyNeedInviteNot"] = 0] = "ApplyNeedInviteNot";
      GroupVerificationType2[GroupVerificationType2["AllNeed"] = 1] = "AllNeed";
      GroupVerificationType2[GroupVerificationType2["AllNot"] = 2] = "AllNot";
    })(GroupVerificationType || (GroupVerificationType = {}));
    (function(MessageStatus2) {
      MessageStatus2[MessageStatus2["Sending"] = 1] = "Sending";
      MessageStatus2[MessageStatus2["Succeed"] = 2] = "Succeed";
      MessageStatus2[MessageStatus2["Succeeded"] = 2] = "Succeeded";
      MessageStatus2[MessageStatus2["Failed"] = 3] = "Failed";
    })(MessageStatus || (MessageStatus = {}));
    (function(Platform2) {
      Platform2[Platform2["iOS"] = 1] = "iOS";
      Platform2[Platform2["Android"] = 2] = "Android";
      Platform2[Platform2["Windows"] = 3] = "Windows";
      Platform2[Platform2["MacOSX"] = 4] = "MacOSX";
      Platform2[Platform2["Web"] = 5] = "Web";
      Platform2[Platform2["Linux"] = 7] = "Linux";
      Platform2[Platform2["AndroidPad"] = 8] = "AndroidPad";
      Platform2[Platform2["iPad"] = 9] = "iPad";
      Platform2[Platform2["Harmony"] = 11] = "Harmony";
    })(Platform || (Platform = {}));
    (function(LogLevel2) {
      LogLevel2[LogLevel2["Verbose"] = 6] = "Verbose";
      LogLevel2[LogLevel2["Debug"] = 5] = "Debug";
      LogLevel2[LogLevel2["Info"] = 4] = "Info";
      LogLevel2[LogLevel2["Warn"] = 3] = "Warn";
      LogLevel2[LogLevel2["Error"] = 2] = "Error";
      LogLevel2[LogLevel2["Fatal"] = 1] = "Fatal";
      LogLevel2[LogLevel2["Panic"] = 0] = "Panic";
    })(LogLevel || (LogLevel = {}));
    (function(ApplicationHandleResult2) {
      ApplicationHandleResult2[ApplicationHandleResult2["Unprocessed"] = 0] = "Unprocessed";
      ApplicationHandleResult2[ApplicationHandleResult2["Agree"] = 1] = "Agree";
      ApplicationHandleResult2[ApplicationHandleResult2["Accepted"] = 1] = "Accepted";
      ApplicationHandleResult2[ApplicationHandleResult2["Reject"] = -1] = "Reject";
      ApplicationHandleResult2[ApplicationHandleResult2["Rejected"] = -1] = "Rejected";
    })(ApplicationHandleResult || (ApplicationHandleResult = {}));
    (function(MessageType2) {
      MessageType2[MessageType2["TextMessage"] = 101] = "TextMessage";
      MessageType2[MessageType2["PictureMessage"] = 102] = "PictureMessage";
      MessageType2[MessageType2["VoiceMessage"] = 103] = "VoiceMessage";
      MessageType2[MessageType2["VideoMessage"] = 104] = "VideoMessage";
      MessageType2[MessageType2["FileMessage"] = 105] = "FileMessage";
      MessageType2[MessageType2["AtTextMessage"] = 106] = "AtTextMessage";
      MessageType2[MessageType2["MergeMessage"] = 107] = "MergeMessage";
      MessageType2[MessageType2["CardMessage"] = 108] = "CardMessage";
      MessageType2[MessageType2["LocationMessage"] = 109] = "LocationMessage";
      MessageType2[MessageType2["CustomMessage"] = 110] = "CustomMessage";
      MessageType2[MessageType2["TypingMessage"] = 113] = "TypingMessage";
      MessageType2[MessageType2["QuoteMessage"] = 114] = "QuoteMessage";
      MessageType2[MessageType2["FaceMessage"] = 115] = "FaceMessage";
      MessageType2[MessageType2["FriendAdded"] = 1201] = "FriendAdded";
      MessageType2[MessageType2["OANotification"] = 1400] = "OANotification";
      MessageType2[MessageType2["GroupCreated"] = 1501] = "GroupCreated";
      MessageType2[MessageType2["GroupInfoUpdated"] = 1502] = "GroupInfoUpdated";
      MessageType2[MessageType2["MemberQuit"] = 1504] = "MemberQuit";
      MessageType2[MessageType2["GroupOwnerTransferred"] = 1507] = "GroupOwnerTransferred";
      MessageType2[MessageType2["MemberKicked"] = 1508] = "MemberKicked";
      MessageType2[MessageType2["MemberInvited"] = 1509] = "MemberInvited";
      MessageType2[MessageType2["MemberEnter"] = 1510] = "MemberEnter";
      MessageType2[MessageType2["GroupDismissed"] = 1511] = "GroupDismissed";
      MessageType2[MessageType2["GroupMemberMuted"] = 1512] = "GroupMemberMuted";
      MessageType2[MessageType2["GroupMemberCancelMuted"] = 1513] = "GroupMemberCancelMuted";
      MessageType2[MessageType2["GroupMuted"] = 1514] = "GroupMuted";
      MessageType2[MessageType2["GroupCancelMuted"] = 1515] = "GroupCancelMuted";
      MessageType2[MessageType2["GroupAnnouncementUpdated"] = 1519] = "GroupAnnouncementUpdated";
      MessageType2[MessageType2["GroupNameUpdated"] = 1520] = "GroupNameUpdated";
      MessageType2[MessageType2["BurnMessageChange"] = 1701] = "BurnMessageChange";
      MessageType2[MessageType2["RevokeMessage"] = 2101] = "RevokeMessage";
    })(MessageType || (MessageType = {}));
    (function(SessionType2) {
      SessionType2[SessionType2["Single"] = 1] = "Single";
      SessionType2[SessionType2["Group"] = 3] = "Group";
      SessionType2[SessionType2["WorkingGroup"] = 3] = "WorkingGroup";
      SessionType2[SessionType2["Notification"] = 4] = "Notification";
    })(SessionType || (SessionType = {}));
    (function(GroupStatus2) {
      GroupStatus2[GroupStatus2["Normal"] = 0] = "Normal";
      GroupStatus2[GroupStatus2["Banned"] = 1] = "Banned";
      GroupStatus2[GroupStatus2["Dismissed"] = 2] = "Dismissed";
      GroupStatus2[GroupStatus2["Muted"] = 3] = "Muted";
    })(GroupStatus || (GroupStatus = {}));
    (function(GroupMentionType2) {
      GroupMentionType2[GroupMentionType2["AtNormal"] = 0] = "AtNormal";
      GroupMentionType2[GroupMentionType2["Normal"] = 0] = "Normal";
      GroupMentionType2[GroupMentionType2["AtMe"] = 1] = "AtMe";
      GroupMentionType2[GroupMentionType2["MentionedMe"] = 1] = "MentionedMe";
      GroupMentionType2[GroupMentionType2["AtAll"] = 2] = "AtAll";
      GroupMentionType2[GroupMentionType2["MentionedAll"] = 2] = "MentionedAll";
      GroupMentionType2[GroupMentionType2["AtAllAtMe"] = 3] = "AtAllAtMe";
      GroupMentionType2[GroupMentionType2["MentionedAllAndMe"] = 3] = "MentionedAllAndMe";
      GroupMentionType2[GroupMentionType2["AtGroupNotice"] = 4] = "AtGroupNotice";
      GroupMentionType2[GroupMentionType2["GroupNotice"] = 4] = "GroupNotice";
    })(GroupMentionType || (GroupMentionType = {}));
    (function(GroupMemberFilter2) {
      GroupMemberFilter2[GroupMemberFilter2["All"] = 0] = "All";
      GroupMemberFilter2[GroupMemberFilter2["Owner"] = 1] = "Owner";
      GroupMemberFilter2[GroupMemberFilter2["Admin"] = 2] = "Admin";
      GroupMemberFilter2[GroupMemberFilter2["Normal"] = 3] = "Normal";
      GroupMemberFilter2[GroupMemberFilter2["AdminAndNormal"] = 4] = "AdminAndNormal";
      GroupMemberFilter2[GroupMemberFilter2["AdminAndOwner"] = 5] = "AdminAndOwner";
    })(GroupMemberFilter || (GroupMemberFilter = {}));
    (function(Relationship2) {
      Relationship2[Relationship2["isBlack"] = 0] = "isBlack";
      Relationship2[Relationship2["Black"] = 0] = "Black";
      Relationship2[Relationship2["isFriend"] = 1] = "isFriend";
      Relationship2[Relationship2["Friend"] = 1] = "Friend";
    })(Relationship || (Relationship = {}));
    (function(LoginStatus2) {
      LoginStatus2[LoginStatus2["Logout"] = 1] = "Logout";
      LoginStatus2[LoginStatus2["LoggedOut"] = 1] = "LoggedOut";
      LoginStatus2[LoginStatus2["Logging"] = 2] = "Logging";
      LoginStatus2[LoginStatus2["LoggingIn"] = 2] = "LoggingIn";
      LoginStatus2[LoginStatus2["Logged"] = 3] = "Logged";
      LoginStatus2[LoginStatus2["LoggedIn"] = 3] = "LoggedIn";
    })(LoginStatus || (LoginStatus = {}));
    (function(OnlineState2) {
      OnlineState2[OnlineState2["Online"] = 1] = "Online";
      OnlineState2[OnlineState2["Offline"] = 0] = "Offline";
    })(OnlineState || (OnlineState = {}));
    (function(GroupMessageReaderFilter2) {
      GroupMessageReaderFilter2[GroupMessageReaderFilter2["Read"] = 0] = "Read";
      GroupMessageReaderFilter2[GroupMessageReaderFilter2["UnRead"] = 1] = "UnRead";
      GroupMessageReaderFilter2[GroupMessageReaderFilter2["Unread"] = 1] = "Unread";
    })(GroupMessageReaderFilter || (GroupMessageReaderFilter = {}));
    (function(MessageViewType2) {
      MessageViewType2[MessageViewType2["History"] = 0] = "History";
      MessageViewType2[MessageViewType2["Search"] = 1] = "Search";
    })(MessageViewType || (MessageViewType = {}));
    WorkerFactory = createBase64WorkerFactory("Lyogcm9sbHVwLXBsdWdpbi13ZWItd29ya2VyLWxvYWRlciAqLwohZnVuY3Rpb24oKXsidXNlIHN0cmljdCI7bGV0IHQ9MzczNTkyODU1OTtjbGFzcyBle2NvbnN0cnVjdG9yKHQse2luaXRpYWxPZmZzZXQ6ZT00LHVzZUF0b21pY3M6aT0hMCxzdHJlYW06cz0hMCxkZWJ1ZzpyLG5hbWU6bn09e30pe3RoaXMuYnVmZmVyPXQsdGhpcy5hdG9taWNWaWV3PW5ldyBJbnQzMkFycmF5KHQpLHRoaXMub2Zmc2V0PWUsdGhpcy51c2VBdG9taWNzPWksdGhpcy5zdHJlYW09cyx0aGlzLmRlYnVnPXIsdGhpcy5uYW1lPW59bG9nKC4uLnQpe3RoaXMuZGVidWcmJmNvbnNvbGUubG9nKGBbcmVhZGVyOiAke3RoaXMubmFtZX1dYCwuLi50KX13YWl0V3JpdGUodCxlPW51bGwpe2lmKHRoaXMudXNlQXRvbWljcyl7Zm9yKHRoaXMubG9nKGB3YWl0aW5nIGZvciAke3R9YCk7MD09PUF0b21pY3MubG9hZCh0aGlzLmF0b21pY1ZpZXcsMCk7KXtpZihudWxsIT1lJiYidGltZWQtb3V0Ij09PUF0b21pY3Mud2FpdCh0aGlzLmF0b21pY1ZpZXcsMCwwLGUpKXRocm93IG5ldyBFcnJvcigidGltZW91dCIpO0F0b21pY3Mud2FpdCh0aGlzLmF0b21pY1ZpZXcsMCwwLDUwMCl9dGhpcy5sb2coYHJlc3VtZWQgZm9yICR7dH1gKX1lbHNlIGlmKDEhPT10aGlzLmF0b21pY1ZpZXdbMF0pdGhyb3cgbmV3IEVycm9yKCJgd2FpdFdyaXRlYCBleHBlY3RlZCBhcnJheSB0byBiZSByZWFkYWJsZSIpfWZsaXAoKXtpZih0aGlzLmxvZygiZmxpcCIpLHRoaXMudXNlQXRvbWljcyl7aWYoMSE9PUF0b21pY3MuY29tcGFyZUV4Y2hhbmdlKHRoaXMuYXRvbWljVmlldywwLDEsMCkpdGhyb3cgbmV3IEVycm9yKCJSZWFkIGRhdGEgb3V0IG9mIHN5bmMhIFRoaXMgaXMgZGlzYXN0cm91cyIpO0F0b21pY3Mubm90aWZ5KHRoaXMuYXRvbWljVmlldywwKX1lbHNlIHRoaXMuYXRvbWljVmlld1swXT0wO3RoaXMub2Zmc2V0PTR9ZG9uZSgpe3RoaXMud2FpdFdyaXRlKCJkb25lIik7bGV0IGU9bmV3IERhdGFWaWV3KHRoaXMuYnVmZmVyLHRoaXMub2Zmc2V0KS5nZXRVaW50MzIoMCk9PT10O3JldHVybiBlJiYodGhpcy5sb2coImRvbmUiKSx0aGlzLmZsaXAoKSksZX1wZWVrKHQpe3RoaXMucGVla09mZnNldD10aGlzLm9mZnNldDtsZXQgZT10KCk7cmV0dXJuIHRoaXMub2Zmc2V0PXRoaXMucGVla09mZnNldCx0aGlzLnBlZWtPZmZzZXQ9bnVsbCxlfXN0cmluZyh0KXt0aGlzLndhaXRXcml0ZSgic3RyaW5nIix0KTtsZXQgZT10aGlzLl9pbnQzMigpLGk9ZS8yLHM9bmV3IERhdGFWaWV3KHRoaXMuYnVmZmVyLHRoaXMub2Zmc2V0LGUpLHI9W107Zm9yKGxldCB0PTA7dDxpO3QrKylyLnB1c2gocy5nZXRVaW50MTYoMip0KSk7bGV0IG49U3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLHIpO3JldHVybiB0aGlzLmxvZygic3RyaW5nIixuKSx0aGlzLm9mZnNldCs9ZSxudWxsPT10aGlzLnBlZWtPZmZzZXQmJnRoaXMuZmxpcCgpLG59X2ludDMyKCl7bGV0IHQ9bmV3IERhdGFWaWV3KHRoaXMuYnVmZmVyLHRoaXMub2Zmc2V0KS5nZXRJbnQzMigpO3JldHVybiB0aGlzLmxvZygiX2ludDMyIix0KSx0aGlzLm9mZnNldCs9NCx0fWludDMyKCl7dGhpcy53YWl0V3JpdGUoImludDMyIik7bGV0IHQ9dGhpcy5faW50MzIoKTtyZXR1cm4gdGhpcy5sb2coImludDMyIix0KSxudWxsPT10aGlzLnBlZWtPZmZzZXQmJnRoaXMuZmxpcCgpLHR9Ynl0ZXMoKXt0aGlzLndhaXRXcml0ZSgiYnl0ZXMiKTtsZXQgdD10aGlzLl9pbnQzMigpLGU9bmV3IEFycmF5QnVmZmVyKHQpO3JldHVybiBuZXcgVWludDhBcnJheShlKS5zZXQobmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsdGhpcy5vZmZzZXQsdCkpLHRoaXMubG9nKCJieXRlcyIsZSksdGhpcy5vZmZzZXQrPXQsbnVsbD09dGhpcy5wZWVrT2Zmc2V0JiZ0aGlzLmZsaXAoKSxlfX1jbGFzcyBpe2NvbnN0cnVjdG9yKHQse2luaXRpYWxPZmZzZXQ6ZT00LHVzZUF0b21pY3M6aT0hMCxzdHJlYW06cz0hMCxkZWJ1ZzpyLG5hbWU6bn09e30pe3RoaXMuYnVmZmVyPXQsdGhpcy5hdG9taWNWaWV3PW5ldyBJbnQzMkFycmF5KHQpLHRoaXMub2Zmc2V0PWUsdGhpcy51c2VBdG9taWNzPWksdGhpcy5zdHJlYW09cyx0aGlzLmRlYnVnPXIsdGhpcy5uYW1lPW4sdGhpcy51c2VBdG9taWNzP0F0b21pY3Muc3RvcmUodGhpcy5hdG9taWNWaWV3LDAsMCk6dGhpcy5hdG9taWNWaWV3WzBdPTB9bG9nKC4uLnQpe3RoaXMuZGVidWcmJmNvbnNvbGUubG9nKGBbd3JpdGVyOiAke3RoaXMubmFtZX1dYCwuLi50KX13YWl0UmVhZCh0KXtpZih0aGlzLnVzZUF0b21pY3Mpe2lmKHRoaXMubG9nKGB3YWl0aW5nIGZvciAke3R9YCksMCE9PUF0b21pY3MuY29tcGFyZUV4Y2hhbmdlKHRoaXMuYXRvbWljVmlldywwLDAsMSkpdGhyb3cgbmV3IEVycm9yKCJXcm90ZSBzb21ldGhpbmcgaW50byB1bndyaXRhYmxlIGJ1ZmZlciEgVGhpcyBpcyBkaXNhc3Ryb3VzIik7Zm9yKEF0b21pY3Mubm90aWZ5KHRoaXMuYXRvbWljVmlldywwKTsxPT09QXRvbWljcy5sb2FkKHRoaXMuYXRvbWljVmlldywwKTspQXRvbWljcy53YWl0KHRoaXMuYXRvbWljVmlldywwLDEsNTAwKTt0aGlzLmxvZyhgcmVzdW1lZCBmb3IgJHt0fWApfWVsc2UgdGhpcy5hdG9taWNWaWV3WzBdPTE7dGhpcy5vZmZzZXQ9NH1maW5hbGl6ZSgpe3RoaXMubG9nKCJmaW5hbGl6aW5nIiksbmV3IERhdGFWaWV3KHRoaXMuYnVmZmVyLHRoaXMub2Zmc2V0KS5zZXRVaW50MzIoMCx0KSx0aGlzLndhaXRSZWFkKCJmaW5hbGl6ZSIpfXN0cmluZyh0KXt0aGlzLmxvZygic3RyaW5nIix0KTtsZXQgZT0yKnQubGVuZ3RoO3RoaXMuX2ludDMyKGUpO2xldCBpPW5ldyBEYXRhVmlldyh0aGlzLmJ1ZmZlcix0aGlzLm9mZnNldCxlKTtmb3IobGV0IGU9MDtlPHQubGVuZ3RoO2UrKylpLnNldFVpbnQxNigyKmUsdC5jaGFyQ29kZUF0KGUpKTt0aGlzLm9mZnNldCs9ZSx0aGlzLndhaXRSZWFkKCJzdHJpbmciKX1faW50MzIodCl7bmV3IERhdGFWaWV3KHRoaXMuYnVmZmVyLHRoaXMub2Zmc2V0KS5zZXRJbnQzMigwLHQpLHRoaXMub2Zmc2V0Kz00fWludDMyKHQpe3RoaXMubG9nKCJpbnQzMiIsdCksdGhpcy5faW50MzIodCksdGhpcy53YWl0UmVhZCgiaW50MzIiKX1ieXRlcyh0KXt0aGlzLmxvZygiYnl0ZXMiLHQpO2xldCBlPXQuYnl0ZUxlbmd0aDt0aGlzLl9pbnQzMihlKSxuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlcix0aGlzLm9mZnNldCkuc2V0KG5ldyBVaW50OEFycmF5KHQpKSx0aGlzLm9mZnNldCs9ZSx0aGlzLndhaXRSZWFkKCJieXRlcyIpfX1sZXQgcz0wLHI9MSxuPTIsbz00O2xldCBhPS9eKCg/IWNocm9tZXxhbmRyb2lkKS4pKnNhZmFyaS9pLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCksbD1uZXcgTWFwLGM9bmV3IE1hcDtmdW5jdGlvbiBoKHQsZSl7aWYoIXQpdGhyb3cgbmV3IEVycm9yKGUpfWNsYXNzIGZ7Y29uc3RydWN0b3IodCxlPSJyZWFkb25seSIpe3RoaXMuZGI9dCx0aGlzLnRyYW5zPXRoaXMuZGIudHJhbnNhY3Rpb24oWyJkYXRhIl0sZSksdGhpcy5zdG9yZT10aGlzLnRyYW5zLm9iamVjdFN0b3JlKCJkYXRhIiksdGhpcy5sb2NrVHlwZT0icmVhZG9ubHkiPT09ZT9yOm8sdGhpcy5jYWNoZWRGaXJzdEJsb2NrPW51bGwsdGhpcy5jdXJzb3I9bnVsbCx0aGlzLnByZXZSZWFkcz1udWxsfWFzeW5jIHByZWZldGNoRmlyc3RCbG9jayh0KXtsZXQgZT1hd2FpdCB0aGlzLmdldCgwKTtyZXR1cm4gdGhpcy5jYWNoZWRGaXJzdEJsb2NrPWUsZX1hc3luYyB3YWl0Q29tcGxldGUoKXtyZXR1cm4gbmV3IFByb21pc2UoKCh0LGUpPT57dGhpcy5jb21taXQoKSx0aGlzLmxvY2tUeXBlPT09bz8odGhpcy50cmFucy5vbmNvbXBsZXRlPWU9PnQoKSx0aGlzLnRyYW5zLm9uZXJyb3I9dD0+ZSh0KSk6YT90aGlzLnRyYW5zLm9uY29tcGxldGU9ZT0+dCgpOnQoKX0pKX1jb21taXQoKXt0aGlzLnRyYW5zLmNvbW1pdCYmdGhpcy50cmFucy5jb21taXQoKX1hc3luYyB1cGdyYWRlRXhjbHVzaXZlKCl7dGhpcy5jb21taXQoKSx0aGlzLnRyYW5zPXRoaXMuZGIudHJhbnNhY3Rpb24oWyJkYXRhIl0sInJlYWR3cml0ZSIpLHRoaXMuc3RvcmU9dGhpcy50cmFucy5vYmplY3RTdG9yZSgiZGF0YSIpLHRoaXMubG9ja1R5cGU9bztsZXQgdD10aGlzLmNhY2hlZEZpcnN0QmxvY2s7cmV0dXJuIGZ1bmN0aW9uKHQsZSl7aWYobnVsbCE9dCYmbnVsbCE9ZSl7bGV0IGk9bmV3IFVpbnQ4QXJyYXkodCkscz1uZXcgVWludDhBcnJheShlKTtmb3IobGV0IHQ9MjQ7dDw0MDt0KyspaWYoaVt0XSE9PXNbdF0pcmV0dXJuITE7cmV0dXJuITB9cmV0dXJuIG51bGw9PXQmJm51bGw9PWV9KGF3YWl0IHRoaXMucHJlZmV0Y2hGaXJzdEJsb2NrKDUwMCksdCl9ZG93bmdyYWRlU2hhcmVkKCl7dGhpcy5jb21taXQoKSx0aGlzLnRyYW5zPXRoaXMuZGIudHJhbnNhY3Rpb24oWyJkYXRhIl0sInJlYWRvbmx5IiksdGhpcy5zdG9yZT10aGlzLnRyYW5zLm9iamVjdFN0b3JlKCJkYXRhIiksdGhpcy5sb2NrVHlwZT1yfWFzeW5jIGdldCh0KXtyZXR1cm4gbmV3IFByb21pc2UoKChlLGkpPT57bGV0IHM9dGhpcy5zdG9yZS5nZXQodCk7cy5vbnN1Y2Nlc3M9dD0+e2Uocy5yZXN1bHQpfSxzLm9uZXJyb3I9dD0+aSh0KX0pKX1nZXRSZWFkRGlyZWN0aW9uKCl7bGV0IHQ9dGhpcy5wcmV2UmVhZHM7aWYodCl7aWYodFswXTx0WzFdJiZ0WzFdPHRbMl0mJnRbMl0tdFswXTwxMClyZXR1cm4ibmV4dCI7aWYodFswXT50WzFdJiZ0WzFdPnRbMl0mJnRbMF0tdFsyXTwxMClyZXR1cm4icHJldiJ9cmV0dXJuIG51bGx9cmVhZCh0KXtsZXQgZT0oKT0+bmV3IFByb21pc2UoKCh0LGUpPT57aWYobnVsbCE9dGhpcy5jdXJzb3JQcm9taXNlKXRocm93IG5ldyBFcnJvcigid2FpdEN1cnNvcigpIGNhbGxlZCBidXQgc29tZXRoaW5nIGVsc2UgaXMgYWxyZWFkeSB3YWl0aW5nIik7dGhpcy5jdXJzb3JQcm9taXNlPXtyZXNvbHZlOnQscmVqZWN0OmV9fSkpO2lmKHRoaXMuY3Vyc29yKXtsZXQgaT10aGlzLmN1cnNvcjtyZXR1cm4ibmV4dCI9PT1pLmRpcmVjdGlvbiYmdD5pLmtleSYmdDxpLmtleSsxMDA/KGkuYWR2YW5jZSh0LWkua2V5KSxlKCkpOiJwcmV2Ij09PWkuZGlyZWN0aW9uJiZ0PGkua2V5JiZ0Pmkua2V5LTEwMD8oaS5hZHZhbmNlKGkua2V5LXQpLGUoKSk6KHRoaXMuY3Vyc29yPW51bGwsdGhpcy5yZWFkKHQpKX17bGV0IGk9dGhpcy5nZXRSZWFkRGlyZWN0aW9uKCk7aWYoaSl7bGV0IHM7dGhpcy5wcmV2UmVhZHM9bnVsbCxzPSJwcmV2Ij09PWk/SURCS2V5UmFuZ2UudXBwZXJCb3VuZCh0KTpJREJLZXlSYW5nZS5sb3dlckJvdW5kKHQpO2xldCByPXRoaXMuc3RvcmUub3BlbkN1cnNvcihzLGkpO3JldHVybiByLm9uc3VjY2Vzcz10PT57bGV0IGU9dC50YXJnZXQucmVzdWx0O2lmKHRoaXMuY3Vyc29yPWUsbnVsbD09dGhpcy5jdXJzb3JQcm9taXNlKXRocm93IG5ldyBFcnJvcigiR290IGRhdGEgZnJvbSBjdXJzb3IgYnV0IG5vdGhpbmcgaXMgd2FpdGluZyBpdCIpO3RoaXMuY3Vyc29yUHJvbWlzZS5yZXNvbHZlKGU/ZS52YWx1ZTpudWxsKSx0aGlzLmN1cnNvclByb21pc2U9bnVsbH0sci5vbmVycm9yPXQ9PntpZihjb25zb2xlLmxvZygiQ3Vyc29yIGZhaWx1cmU6Iix0KSxudWxsPT10aGlzLmN1cnNvclByb21pc2UpdGhyb3cgbmV3IEVycm9yKCJHb3QgZGF0YSBmcm9tIGN1cnNvciBidXQgbm90aGluZyBpcyB3YWl0aW5nIGl0Iik7dGhpcy5jdXJzb3JQcm9taXNlLnJlamVjdCh0KSx0aGlzLmN1cnNvclByb21pc2U9bnVsbH0sZSgpfXJldHVybiBudWxsPT10aGlzLnByZXZSZWFkcyYmKHRoaXMucHJldlJlYWRzPVswLDAsMF0pLHRoaXMucHJldlJlYWRzLnB1c2godCksdGhpcy5wcmV2UmVhZHMuc2hpZnQoKSx0aGlzLmdldCh0KX19YXN5bmMgc2V0KHQpe3JldHVybiB0aGlzLnByZXZSZWFkcz1udWxsLG5ldyBQcm9taXNlKCgoZSxpKT0+e2xldCBzPXRoaXMuc3RvcmUucHV0KHQudmFsdWUsdC5rZXkpO3Mub25zdWNjZXNzPXQ9PmUocy5yZXN1bHQpLHMub25lcnJvcj10PT5pKHQpfSkpfWFzeW5jIGJ1bGtTZXQodCl7dGhpcy5wcmV2UmVhZHM9bnVsbDtmb3IobGV0IGUgb2YgdCl0aGlzLnN0b3JlLnB1dChlLnZhbHVlLGUua2V5KX19YXN5bmMgZnVuY3Rpb24gdSh0KXtyZXR1cm4gbmV3IFByb21pc2UoKChlLGkpPT57aWYobC5nZXQodCkpcmV0dXJuIHZvaWQgZShsLmdldCh0KSk7bGV0IHM9Z2xvYmFsVGhpcy5pbmRleGVkREIub3Blbih0LDIpO3Mub25zdWNjZXNzPWk9PntsZXQgcz1pLnRhcmdldC5yZXN1bHQ7cy5vbnZlcnNpb25jaGFuZ2U9KCk9Pntjb25zb2xlLmxvZygiY2xvc2luZyBiZWNhdXNlIHZlcnNpb24gY2hhbmdlZCIpLHMuY2xvc2UoKSxsLmRlbGV0ZSh0KX0scy5vbmNsb3NlPSgpPT57bC5kZWxldGUodCl9LGwuc2V0KHQscyksZShzKX0scy5vbnVwZ3JhZGVuZWVkZWQ9dD0+e2xldCBlPXQudGFyZ2V0LnJlc3VsdDtlLm9iamVjdFN0b3JlTmFtZXMuY29udGFpbnMoImRhdGEiKXx8ZS5jcmVhdGVPYmplY3RTdG9yZSgiZGF0YSIpfSxzLm9uYmxvY2tlZD10PT5jb25zb2xlLmxvZygiYmxvY2tlZCIsdCkscy5vbmVycm9yPXMub25hYm9ydD10PT5pKHQudGFyZ2V0LmVycm9yKX0pKX1hc3luYyBmdW5jdGlvbiB3KHQsZSxpKXtsZXQgcz1jLmdldCh0KTtpZihzKXtpZigicmVhZHdyaXRlIj09PWUmJnMubG9ja1R5cGU9PT1yKXRocm93IG5ldyBFcnJvcigiQXR0ZW1wdGVkIHdyaXRlIGJ1dCBvbmx5IGhhcyBTSEFSRUQgbG9jayIpO3JldHVybiBpKHMpfXM9bmV3IGYoYXdhaXQgdSh0KSxlKSxhd2FpdCBpKHMpLGF3YWl0IHMud2FpdENvbXBsZXRlKCl9YXN5bmMgZnVuY3Rpb24gZCh0LGUsaSl7bGV0IG49ZnVuY3Rpb24odCl7cmV0dXJuIGMuZ2V0KHQpfShlKTtpZihpPT09cil7aWYobnVsbD09bil0aHJvdyBuZXcgRXJyb3IoIlVubG9jayBlcnJvciAoU0hBUkVEKTogbm8gdHJhbnNhY3Rpb24gcnVubmluZyIpO24ubG9ja1R5cGU9PT1vJiZuLmRvd25ncmFkZVNoYXJlZCgpfWVsc2UgaT09PXMmJm4mJihhd2FpdCBuLndhaXRDb21wbGV0ZSgpLGMuZGVsZXRlKGUpKTt0LmludDMyKDApLHQuZmluYWxpemUoKX1hc3luYyBmdW5jdGlvbiBnKHQsZSl7bGV0IGk9dC5zdHJpbmcoKTtzd2l0Y2goaSl7Y2FzZSJwcm9maWxlLXN0YXJ0Ijp0LmRvbmUoKSxlLmludDMyKDApLGUuZmluYWxpemUoKSxnKHQsZSk7YnJlYWs7Y2FzZSJwcm9maWxlLXN0b3AiOnQuZG9uZSgpLGF3YWl0IG5ldyBQcm9taXNlKCh0PT5zZXRUaW1lb3V0KHQsMWUzKSkpLGUuaW50MzIoMCksZS5maW5hbGl6ZSgpLGcodCxlKTticmVhaztjYXNlIndyaXRlQmxvY2tzIjp7bGV0IGk9dC5zdHJpbmcoKSxzPVtdO2Zvcig7IXQuZG9uZSgpOyl7bGV0IGU9dC5pbnQzMigpLGk9dC5ieXRlcygpO3MucHVzaCh7cG9zOmUsZGF0YTppfSl9YXdhaXQgYXN5bmMgZnVuY3Rpb24odCxlLGkpe3JldHVybiB3KGUsInJlYWR3cml0ZSIsKGFzeW5jIGU9Pnthd2FpdCBlLmJ1bGtTZXQoaS5tYXAoKHQ9Pih7a2V5OnQucG9zLHZhbHVlOnQuZGF0YX0pKSkpLHQuaW50MzIoMCksdC5maW5hbGl6ZSgpfSkpfShlLGkscyksZyh0LGUpO2JyZWFrfWNhc2UicmVhZEJsb2NrIjp7bGV0IGk9dC5zdHJpbmcoKSxzPXQuaW50MzIoKTt0LmRvbmUoKSxhd2FpdCBhc3luYyBmdW5jdGlvbih0LGUsaSl7cmV0dXJuIHcoZSwicmVhZG9ubHkiLChhc3luYyBlPT57bGV0IHM9YXdhaXQgZS5yZWFkKGkpO251bGw9PXM/dC5ieXRlcyhuZXcgQXJyYXlCdWZmZXIoMCkpOnQuYnl0ZXMocyksdC5maW5hbGl6ZSgpfSkpfShlLGkscyksZyh0LGUpO2JyZWFrfWNhc2UicmVhZE1ldGEiOntsZXQgaT10LnN0cmluZygpO3QuZG9uZSgpLGF3YWl0IGFzeW5jIGZ1bmN0aW9uKHQsZSl7cmV0dXJuIHcoZSwicmVhZG9ubHkiLChhc3luYyBpPT57dHJ5e2NvbnNvbGUubG9nKCJSZWFkaW5nIG1ldGEuLi4iKTtsZXQgcz1hd2FpdCBpLmdldCgtMSk7aWYoY29uc29sZS5sb2coYEdvdCBtZXRhIGZvciAke2V9OmAscyksbnVsbD09cyl0LmludDMyKC0xKSx0LmludDMyKDQwOTYpLHQuZmluYWxpemUoKTtlbHNle2xldCBlPWF3YWl0IGkuZ2V0KDApLHI9NDA5NjtlJiYocj0yNTYqbmV3IFVpbnQxNkFycmF5KGUpWzhdKSx0LmludDMyKHMuc2l6ZSksdC5pbnQzMihyKSx0LmZpbmFsaXplKCl9fWNhdGNoKGUpe2NvbnNvbGUubG9nKGUpLHQuaW50MzIoLTEpLHQuaW50MzIoLTEpLHQuZmluYWxpemUoKX19KSl9KGUsaSksZyh0LGUpO2JyZWFrfWNhc2Uid3JpdGVNZXRhIjp7bGV0IGk9dC5zdHJpbmcoKSxzPXQuaW50MzIoKTt0LmRvbmUoKSxhd2FpdCBhc3luYyBmdW5jdGlvbih0LGUsaSl7cmV0dXJuIHcoZSwicmVhZHdyaXRlIiwoYXN5bmMgZT0+e3RyeXthd2FpdCBlLnNldCh7a2V5Oi0xLHZhbHVlOml9KSx0LmludDMyKDApLHQuZmluYWxpemUoKX1jYXRjaChlKXtjb25zb2xlLmxvZyhlKSx0LmludDMyKC0xKSx0LmZpbmFsaXplKCl9fSkpfShlLGkse3NpemU6c30pLGcodCxlKTticmVha31jYXNlImNsb3NlRmlsZSI6e2xldCBpPXQuc3RyaW5nKCk7dC5kb25lKCksZS5pbnQzMigwKSxlLmZpbmFsaXplKCksZnVuY3Rpb24odCl7bGV0IGU9bC5nZXQodCk7ZSYmKGUuY2xvc2UoKSxsLmRlbGV0ZSh0KSl9KGkpLHNlbGYuY2xvc2UoKTticmVha31jYXNlImxvY2tGaWxlIjp7bGV0IGk9dC5zdHJpbmcoKSxzPXQuaW50MzIoKTt0LmRvbmUoKSxhd2FpdCBhc3luYyBmdW5jdGlvbih0LGUsaSl7bGV0IHM9Yy5nZXQoZSk7aWYocylpZihpPnMubG9ja1R5cGUpe2gocy5sb2NrVHlwZT09PXIsYFVwcmFkaW5nIGxvY2sgdHlwZSBmcm9tICR7cy5sb2NrVHlwZX0gaXMgaW52YWxpZGApLGgoaT09PW58fGk9PT1vLGBVcGdyYWRpbmcgbG9jayB0eXBlIHRvICR7aX0gaXMgaW52YWxpZGApO2xldCBlPWF3YWl0IHMudXBncmFkZUV4Y2x1c2l2ZSgpO3QuaW50MzIoZT8wOi0xKSx0LmZpbmFsaXplKCl9ZWxzZSBoKHMubG9ja1R5cGU9PT1pLGBEb3duZ3JhZGluZyBsb2NrIHRvICR7aX0gaXMgaW52YWxpZGApLHQuaW50MzIoMCksdC5maW5hbGl6ZSgpO2Vsc2V7aChpPT09cixgTmV3IGxvY2tzIG11c3Qgc3RhcnQgYXMgU0hBUkVEIGluc3RlYWQgb2YgJHtpfWApO2xldCBzPW5ldyBmKGF3YWl0IHUoZSkpO2F3YWl0IHMucHJlZmV0Y2hGaXJzdEJsb2NrKDUwMCksYy5zZXQoZSxzKSx0LmludDMyKDApLHQuZmluYWxpemUoKX19KGUsaSxzKSxnKHQsZSk7YnJlYWt9Y2FzZSJ1bmxvY2tGaWxlIjp7bGV0IGk9dC5zdHJpbmcoKSxzPXQuaW50MzIoKTt0LmRvbmUoKSxhd2FpdCBkKGUsaSxzKSxnKHQsZSk7YnJlYWt9ZGVmYXVsdDp0aHJvdyBuZXcgRXJyb3IoIlVua25vd24gbWV0aG9kOiAiK2kpfX1zZWxmLm9ubWVzc2FnZT10PT57c3dpdGNoKHQuZGF0YS50eXBlKXtjYXNlImluaXQiOntsZXRbcyxyXT10LmRhdGEuYnVmZmVycztnKG5ldyBlKHMse25hbWU6ImFyZ3MiLGRlYnVnOiExfSksbmV3IGkocix7bmFtZToicmVzdWx0cyIsZGVidWc6ITF9KSk7YnJlYWt9fX19KCk7Cgo=", null, false);
    indexeddbMainThreadWorkerB24e7a21 = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      "default": WorkerFactory
    });
  }
});

// src/app-omega.js
var require_app_omega = __commonJS({
  "src/app-omega.js"() {
    init_index_es();
    var API = "http://127.0.0.1:10002";
    var WS = "ws://127.0.0.1:10001";
    var GROUP_ID = "g-1";
    var HUMAN_ID = "agentDemoA";
    var AGENT_ID = "agentDemoB";
    var GATEWAY = "http://127.0.0.1:9000";
    var OpenIM = getSDK({ coreWasmPath: "/static/openIM.wasm", sqlWasmPath: "/static/sql-wasm.wasm" });
    window.__omState = { phase: "init" };
    var $ = (id) => document.getElementById(id);
    var messages = $("msgs");
    var timeline = $("tl");
    function addMsg(sender, text, isMe) {
      const el = document.createElement("div");
      el.className = `msg ${isMe ? "me" : "other"}`;
      const avatar = isMe ? "\u{1F9D1}" : "\u{1F916}";
      const name = isMe ? "\u4F60" : "\u5C0F\u8BED";
      el.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div>
      <div class="meta"><span>${name}</span><span>${(/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false })}</span></div>
      <div class="bub"></div>
    </div>`;
      el.querySelector(".bub").textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }
    function showTyping() {
      const el = document.createElement("div");
      el.className = "msg other";
      el.id = "typingEl";
      el.innerHTML = `<div class="avatar">\u{1F916}</div><div><div class="bub"><div class="typing"><i></i><i></i><i></i></div></div></div>`;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
    }
    function hideTyping() {
      const t = $("typingEl");
      if (t) t.remove();
    }
    function addTimeline(type, text) {
      const now = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-CN", { hour12: false });
      const tags = { thinking: "\u{1F4AD}", task_started: "\u25B6", task_completed: "\u2713", message_sent: "\u{1F4E4}", error: "\u26A0", tool_call: "\u{1F527}" };
      const el = document.createElement("div");
      el.className = "tl-item";
      el.innerHTML = `<span class="t">${now}</span><span class="tag">${tags[type] || "\xB7"}</span><span>${text}</span>`;
      timeline.prepend(el);
      while (timeline.children.length > 30) timeline.lastChild.remove();
    }
    async function pollAgentState() {
      try {
        const r = await fetch(`${GATEWAY}/api/agent/state`);
        const j = await r.json();
        const a = j.agent;
        $("pill").textContent = a.status;
        $("pill").className = "status-pill " + a.status;
        $("task").textContent = a.currentTask || "\u7B49\u5F85\u4EFB\u52A1\u2026";
        $("pb").style.width = Math.round((a.progress || 0) * 100) + "%";
        $("m1").textContent = `\u56DE\u590D ${a.metrics?.replies || 0}`;
        $("m2").textContent = `tokens ${(a.metrics?.tokensIn || 0) + (a.metrics?.tokensOut || 0)}`;
      } catch (e) {
      }
    }
    function connectEvents() {
      let ws;
      const connect = () => {
        ws = new WebSocket(`${GATEWAY.replace("http", "ws")}/ws/events`);
        ws.onmessage = (ev) => {
          try {
            const e = JSON.parse(ev.data);
            if (e.type === "thinking") {
              showTyping();
            }
            if (e.type === "task_completed" || e.type === "message_sent" || e.type === "error") hideTyping();
            addTimeline(e.type, e.data?.text || e.data?.message || JSON.stringify(e.data).slice(0, 50));
          } catch (e2) {
          }
        };
        ws.onclose = () => setTimeout(connect, 3e3);
      };
      connect();
    }
    async function getToken() {
      const r = await fetch(`${API}/auth/get_admin_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", operationID: "op-" + Date.now() },
        body: JSON.stringify({ secret: "openIM123", userID: "imAdmin", platform: 1 })
      });
      const admin = await r.json();
      const r2 = await fetch(`${API}/auth/get_user_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", operationID: "op-" + Date.now(), token: admin.data.token },
        body: JSON.stringify({ secret: "openIM123", userID: HUMAN_ID, platformID: 5 })
      });
      const user = await r2.json();
      return user.data.token;
    }
    OpenIM.on(CbEvents.OnConnecting, () => {
    });
    var _welcomeShown = false;
    OpenIM.on(CbEvents.OnConnectSuccess, () => {
      $("conn").innerHTML = '<span class="dot online"></span> \u5DF2\u8FDE\u63A5';
      $("mask").style.display = "none";
      window.__omState.phase = "connected";
      if (!_welcomeShown) {
        _welcomeShown = true;
        addMsg(AGENT_ID, "\u6211\u662F\u5C0F\u8BED\uFF0C\u4F60\u7684 AI \u5DE5\u4F5C\u4F19\u4F34\u3002\u6709\u4E8B\u76F4\u63A5\u8BF4\uFF0C\u6211\u6765\u5E72\u3002", false);
        setInterval(pollAgentState, 2e3);
        connectEvents();
      }
    });
    OpenIM.on(CbEvents.OnConnectFailed, (e) => {
      $("conn").innerHTML = '<span class="dot offline"></span> \u8FDE\u63A5\u5931\u8D25';
      $("mask").querySelector(".txt").textContent = "\u8FDE\u63A5\u5931\u8D25: " + (e?.errMsg || "") + "\uFF0C\u91CD\u8BD5\u4E2D\u2026";
    });
    OpenIM.on(CbEvents.OnRecvNewMessages, (e) => {
      for (const m of e.data) {
        const text = m.textElem?.content;
        if (!text) continue;
        const fromMe = m.sendID === HUMAN_ID;
        const fromAgent = m.sendID === AGENT_ID;
        if (fromAgent) hideTyping();
        if (fromMe || fromAgent) addMsg(m.sendID, text, fromMe);
        else addMsg(m.sendID, text, false);
      }
    });
    async function sendMessage() {
      const input = $("input");
      const text = input.value.trim();
      if (!text || window.__omState.phase !== "connected") return;
      input.value = "";
      input.style.height = "auto";
      addMsg(HUMAN_ID, text, true);
      try {
        const cm = await OpenIM.createTextMessage(text);
        let msg = cm.data;
        if (typeof msg === "string") msg = JSON.parse(msg);
        await OpenIM.sendMessage({ recvID: "", groupID: GROUP_ID, message: msg });
      } catch (e) {
        console.error("\u53D1\u9001\u5931\u8D25", e);
      }
    }
    $("sendBtn").addEventListener("click", sendMessage);
    $("input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    $("input").addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });
    async function main() {
      const token = await getToken();
      window.__omState.phase = "login";
      await OpenIM.login({ userID: HUMAN_ID, token, platformID: 5, apiAddr: API, wsAddr: WS });
      window.__omState.phase = "logged_in";
      console.log("\u767B\u5F55\u5B8C\u6210\uFF0C\u7B49\u5F85\u8FDE\u63A5\u4E8B\u4EF6\u2026");
    }
    main().catch((e) => {
      $("mask").querySelector(".txt").textContent = "\u521D\u59CB\u5316\u5931\u8D25: " + e.message;
      console.error(e);
    });
  }
});
export default require_app_omega();
