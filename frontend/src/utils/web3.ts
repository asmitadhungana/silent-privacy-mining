export const ellipseAddress = (address: string): string => {
  if (!address) {
    return '';
  }
  return address.slice(0, 6) + '...' + address.slice(address.length - 4, address.length);
};
