const { DocumentPage, Host, getQueryStringParam } = window.stencila
const initBackend = require('../shared/initBackend')
const remote = require('electron').remote
const { Menu } = remote
const ipc = require('electron').ipcRenderer
const DocumentMenuBuilder = require('./DocumentMenuBuilder')
const currentWindow = remote.getCurrentWindow()
const windowId = currentWindow.id
const documentMenuBuilder = new DocumentMenuBuilder()
const AppState = require('./AppState')
const { dialog } = require('electron').remote
const { shell } = remote

let appState = new AppState()

function _updateMenu() {
  let menu = documentMenuBuilder.build(appState)
  Menu.setApplicationMenu(menu)
}

appState.on('change', () => {
  _updateMenu(appState)
  let title = appState.get('title')
  if (appState.get('hasPendingChanges')) {
    title += ' *'
  }
  window.document.title = title
})

currentWindow.on('focus', () => {
  _updateMenu(appState)
  ipc.send('windowFocused', {
    windowId: windowId,
    data: 'dashboard'
  })
})

// HACK: we should find a better solution to intercept window.open calls
// (e.g. as done by LinkComponent)
window.open = function(url /*, frameName, features*/) {
  shell.openExternal(url)
}

window.onbeforeunload = function () {

  if (!window.__closing && appState.get('hasPendingChanges')) {
    dialog.showMessageBox({
      type: "question",
      title: "Unsaved changes",
      message: "Document has changes, do you want to save them?",
      buttons: ["Don't save", "Cancel", "Save"],
      defaultId: 2,
      cancelId: 1
    }, function(buttonId) {
      if (buttonId === 0) {
        window.documentPage.discard().then(() => {
          window.__closing = true
          currentWindow.close()
        })
      } else if (buttonId === 2) {
        window.documentPage.save().then(() => {
          window.__closing = true
          currentWindow.close()
        })
      }
    })
  }

  if (!window.__closing && appState.get('hasPendingChanges')) {
    return false // keeps the window open
  }
}


ipc.on('command:executed', function(sender, data) {
  window.documentPage.executeCommand(data.commandName, data.commandParams)
})

ipc.on('save:requested', function() {
  window.documentPage.save()
})

_updateMenu(appState)

window.addEventListener('load', () => {
  initBackend().then((backend) => {
    // A new host in the browser window that will discover peers:
    //  e.g. Stencila Node.js host started in `main.js`
    //  e.g. Stencila R host started 'manually' locally
    //  e.g. Stencila Python host started in a docker container
    let host = new Host({
      // No initial peers
      peers: null,
      // Attempt to discover local peers every x seconds
      discover: 30
    })
    window.host = host

    window.backend = backend

    let documentId = getQueryStringParam('documentId')
    window.documentId = documentId

    window.documentPage = DocumentPage.mount({
      host,
      backend,
      appState,
      documentId
    }, window.document.body)
  })
})
