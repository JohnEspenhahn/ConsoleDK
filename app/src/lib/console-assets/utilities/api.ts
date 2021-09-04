declare var window: any;

function getMeta(metaName: string) {
  const metas = window.document.getElementsByTagName('meta');

  for (let i = 0; i < metas.length; i++) {
    if (metas[i].getAttribute('name') === metaName) {
      return metas[i].getAttribute('content');
    }
  }

  return '';
}

function getServiceEndpoint() {
  return getMeta("serviceEndpoint");
}

export async function apiCall(path: string): Promise<any> {
  return new Promise((resolve) => {
      fetch(`${getServiceEndpoint()}/apiv1/${path}`)
          .then(response => response.json())
          .then(data => resolve(data));
  });
}
