import type { FileSaver } from '@/application/ports'

// The browser saves the file as a download of a link to it.
export function createDownloadSaver(): FileSaver {
  return {
    save(name, text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      // Revoked at once, the URL can be gone before the download has read it.
      setTimeout(() => URL.revokeObjectURL(url))
    },
  }
}
