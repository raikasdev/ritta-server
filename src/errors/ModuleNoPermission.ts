export default class ModuleNoPermission extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleNoPermission';
  }
}
